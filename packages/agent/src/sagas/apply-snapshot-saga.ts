import { execFile } from "node:child_process";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";
import { Saga, type SagaLogger } from "@posthog/shared";
import * as tar from "tar";
import type { PostHogAPIClient } from "../posthog-api.js";
import type { TreeSnapshot } from "../types.js";

const execFileAsync = promisify(execFile);

export interface ApplySnapshotInput {
  snapshot: TreeSnapshot;
  repositoryPath: string;
  apiClient: PostHogAPIClient;
  taskId: string;
  runId: string;
}

export interface ApplySnapshotOutput {
  treeHash: string;
}

export class ApplySnapshotSaga extends Saga<
  ApplySnapshotInput,
  ApplySnapshotOutput
> {
  private archivePath: string | null = null;
  private originalHead: string | null = null;

  constructor(logger?: SagaLogger) {
    super(logger);
  }

  protected async execute(input: ApplySnapshotInput): Promise<ApplySnapshotOutput> {
    const { snapshot, repositoryPath, apiClient, taskId, runId } = input;
    const tmpDir = join(repositoryPath, ".posthog", "tmp");

    if (!snapshot.archiveUrl) {
      throw new Error("Cannot apply snapshot: no archive URL");
    }

    // Step 1: Record current HEAD for rollback (read-only)
    this.originalHead = await this.readOnlyStep("get_current_head", async () => {
      try {
        return await this.git(["rev-parse", "HEAD"], repositoryPath);
      } catch {
        return null;
      }
    });

    // Step 2: Download archive
    this.archivePath = join(tmpDir, `${snapshot.treeHash}.tar.gz`);
    await this.step({
      name: "download_archive",
      execute: async () => {
        await mkdir(tmpDir, { recursive: true });
        const arrayBuffer = await apiClient.downloadArtifact(
          taskId,
          runId,
          snapshot.archiveUrl!,
        );
        if (!arrayBuffer) {
          throw new Error("Failed to download archive");
        }
        // Decode base64 content
        const base64Content = Buffer.from(arrayBuffer).toString("utf-8");
        const binaryContent = Buffer.from(base64Content, "base64");
        await writeFile(this.archivePath!, binaryContent);
      },
      rollback: async () => {
        if (this.archivePath) {
          await rm(this.archivePath, { force: true }).catch(() => {});
        }
      },
    });

    // Step 3: Checkout base commit if present and different from current
    if (snapshot.baseCommit && snapshot.baseCommit !== this.originalHead) {
      await this.step({
        name: "checkout_base",
        execute: async () => {
          await this.git(["checkout", snapshot.baseCommit!], repositoryPath);
        },
        rollback: async () => {
          if (this.originalHead) {
            await this.git(["checkout", this.originalHead], repositoryPath).catch(
              (error) => {
                this.log.warn("Failed to rollback checkout", { error });
              },
            );
          }
        },
      });
    }

    // Step 4: Extract archive (adds/modifies files)
    await this.step({
      name: "extract_archive",
      execute: async () => {
        await tar.extract({
          file: this.archivePath!,
          cwd: repositoryPath,
        });
      },
      rollback: async () => {
        // Can't easily undo file extraction - would need to track original files
        this.log.warn("Cannot rollback file extraction - files may be inconsistent");
      },
    });

    // Step 5: Delete files marked as deleted
    for (const change of snapshot.changes.filter((c) => c.status === "D")) {
      await this.step({
        name: `delete_${change.path}`,
        execute: async () => {
          const fullPath = join(repositoryPath, change.path);
          await rm(fullPath, { force: true });
          this.log.debug(`Deleted file: ${change.path}`);
        },
        rollback: async () => {
          // Can't restore deleted file without backup
          this.log.warn(`Cannot restore deleted file: ${change.path}`);
        },
      });
    }

    // Clean up archive on success
    await rm(this.archivePath, { force: true }).catch(() => {});

    const deletedCount = snapshot.changes.filter((c) => c.status === "D").length;
    this.log.info("Tree snapshot applied", {
      treeHash: snapshot.treeHash,
      totalChanges: snapshot.changes.length,
      deletedFiles: deletedCount,
    });

    return { treeHash: snapshot.treeHash };
  }

  private async git(args: string[], cwd: string): Promise<string> {
    const { stdout } = await execFileAsync("git", args, { cwd });
    return stdout.trim();
  }
}
