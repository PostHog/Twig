import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";
import { Saga, type SagaLogger } from "@posthog/shared";
import * as tar from "tar";
import type { PostHogAPIClient } from "../posthog-api.js";
import type { FileChange, FileStatus, TreeSnapshot } from "../types.js";

const execFileAsync = promisify(execFile);

export interface CaptureTreeInput {
  repositoryPath: string;
  taskId: string;
  runId: string;
  apiClient?: PostHogAPIClient;
  lastTreeHash: string | null;
  interrupted?: boolean;
}

export interface CaptureTreeOutput {
  snapshot: TreeSnapshot | null;
  newTreeHash: string | null;
}

export class CaptureTreeSaga extends Saga<CaptureTreeInput, CaptureTreeOutput> {
  private tempIndexPath: string | null = null;
  private archivePath: string | null = null;

  constructor(logger?: SagaLogger) {
    super(logger);
  }

  protected async execute(input: CaptureTreeInput): Promise<CaptureTreeOutput> {
    const { repositoryPath, runId, lastTreeHash, interrupted, apiClient } =
      input;
    const tmpDir = join(repositoryPath, ".posthog", "tmp");

    // Step 1: Create temp directory (idempotent - mkdir with recursive does nothing if exists)
    await this.step({
      name: "create_tmp_dir",
      execute: () => mkdir(tmpDir, { recursive: true }),
      rollback: async () => {},
    });

    // Step 2: Create temp index and write tree
    this.tempIndexPath = join(tmpDir, `index-${runId}-${Date.now()}`);
    const treeHash = await this.step({
      name: "create_tree",
      execute: async () => {
        await this.gitWithTempIndex(
          ["read-tree", "HEAD"],
          this.tempIndexPath!,
          repositoryPath,
        );
        await this.gitWithTempIndex(
          ["add", "-A"],
          this.tempIndexPath!,
          repositoryPath,
        );
        return this.gitWithTempIndex(
          ["write-tree"],
          this.tempIndexPath!,
          repositoryPath,
        );
      },
      rollback: async () => {
        if (this.tempIndexPath) {
          await rm(this.tempIndexPath, { force: true }).catch(() => {});
        }
      },
    });

    // Early return if no changes since last capture
    if (treeHash === lastTreeHash) {
      this.log.debug("No changes since last capture", { treeHash });
      await rm(this.tempIndexPath, { force: true }).catch(() => {});
      return { snapshot: null, newTreeHash: lastTreeHash };
    }

    // Step 3: Get base commit (read-only)
    const baseCommit = await this.readOnlyStep("get_base_commit", async () => {
      try {
        return await this.git(["rev-parse", "HEAD"], repositoryPath);
      } catch {
        return null;
      }
    });

    // Step 4: Get changes between last snapshot and new tree (read-only)
    const changes = await this.readOnlyStep("get_changes", () =>
      this.getChanges(lastTreeHash ?? baseCommit, treeHash, repositoryPath),
    );

    // Step 5: Upload archive if API client configured and there are non-delete changes
    const filesToArchive = changes
      .filter((c) => c.status !== "D")
      .map((c) => c.path);

    let archiveUrl: string | undefined;
    if (apiClient && filesToArchive.length > 0) {
      archiveUrl = await this.step({
        name: "upload_archive",
        execute: async () => {
          this.archivePath = join(tmpDir, `${treeHash}.tar.gz`);

          // Filter to only files that exist
          const existingFiles = filesToArchive.filter((f) => {
            const filePath = join(repositoryPath, f);
            return existsSync(filePath);
          });

          if (existingFiles.length === 0) {
            return undefined;
          }

          // Create tar.gz archive
          await tar.create(
            {
              gzip: true,
              file: this.archivePath,
              cwd: repositoryPath,
            },
            existingFiles,
          );

          // Read and upload
          const archiveContent = await readFile(this.archivePath);
          const base64Content = archiveContent.toString("base64");

          const artifacts = await apiClient.uploadTaskArtifacts(
            input.taskId,
            input.runId,
            [
              {
                name: `trees/${treeHash}.tar.gz`,
                type: "tree_snapshot",
                content: base64Content,
                content_type: "application/gzip",
              },
            ],
          );

          if (artifacts.length > 0 && artifacts[0].storage_path) {
            this.log.info("Tree archive uploaded", {
              storagePath: artifacts[0].storage_path,
              treeHash,
              filesCount: existingFiles.length,
            });
            return artifacts[0].storage_path;
          }

          return undefined;
        },
        rollback: async () => {
          if (this.archivePath) {
            await rm(this.archivePath, { force: true }).catch(() => {});
          }
        },
      });
    }

    // Clean up temp files on success
    await rm(this.tempIndexPath, { force: true }).catch(() => {});
    if (this.archivePath) {
      await rm(this.archivePath, { force: true }).catch(() => {});
    }

    const snapshot: TreeSnapshot = {
      treeHash,
      baseCommit,
      changes,
      timestamp: new Date().toISOString(),
      interrupted,
      archiveUrl,
    };

    this.log.info("Tree captured", {
      treeHash,
      changes: changes.length,
      interrupted,
      archiveUrl,
    });

    return { snapshot, newTreeHash: treeHash };
  }

  private async gitWithTempIndex(
    args: string[],
    tempIndexPath: string,
    cwd: string,
  ): Promise<string> {
    const { stdout } = await execFileAsync("git", args, {
      cwd,
      env: { ...process.env, GIT_INDEX_FILE: tempIndexPath },
    });
    return stdout.trim();
  }

  private async git(args: string[], cwd: string): Promise<string> {
    const { stdout } = await execFileAsync("git", args, { cwd });
    return stdout.trim();
  }

  private async getChanges(
    fromRef: string | null,
    toRef: string,
    repositoryPath: string,
  ): Promise<FileChange[]> {
    if (!fromRef) {
      // No previous ref - list all files in tree as added
      const stdout = await this.git(
        ["ls-tree", "-r", "--name-only", toRef],
        repositoryPath,
      );
      return stdout
        .split("\n")
        .filter((path) => path.trim() && !path.includes(".posthog/"))
        .map((path) => ({ path, status: "A" as FileStatus }));
    }

    const stdout = await this.git(
      ["diff-tree", "-r", "--name-status", fromRef, toRef],
      repositoryPath,
    );

    const changes: FileChange[] = [];
    for (const line of stdout.split("\n")) {
      if (!line.trim()) continue;
      const [status, filePath] = line.split("\t");
      if (!filePath || filePath.includes(".posthog/")) continue;

      let normalizedStatus: FileStatus;
      if (status === "D") {
        normalizedStatus = "D";
      } else if (status === "A") {
        normalizedStatus = "A";
      } else {
        normalizedStatus = "M";
      }

      changes.push({ path: filePath, status: normalizedStatus });
    }

    return changes;
  }
}
