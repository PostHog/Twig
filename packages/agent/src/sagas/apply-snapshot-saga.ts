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
  private originalBranch: string | null = null;

  constructor(logger?: SagaLogger) {
    super(logger);
  }

  protected async execute(input: ApplySnapshotInput): Promise<ApplySnapshotOutput> {
    const { snapshot, repositoryPath, apiClient, taskId, runId } = input;
    const tmpDir = join(repositoryPath, ".posthog", "tmp");

    if (!snapshot.archiveUrl) {
      throw new Error("Cannot apply snapshot: no archive URL");
    }

    // Step 1: Record current HEAD and branch for rollback (read-only)
    const headInfo = await this.readOnlyStep("get_current_head", async () => {
      let head: string | null = null;
      let branch: string | null = null;

      try {
        head = await this.git(["rev-parse", "HEAD"], repositoryPath);
      } catch {
        head = null;
      }

      try {
        branch = await this.git(
          ["symbolic-ref", "--short", "HEAD"],
          repositoryPath,
        );
      } catch {
        branch = null;
      }

      return { head, branch };
    });
    this.originalHead = headInfo.head;
    this.originalBranch = headInfo.branch;

    // Step 2: Check for uncommitted changes if we need to checkout a different commit
    if (snapshot.baseCommit && snapshot.baseCommit !== this.originalHead) {
      await this.readOnlyStep("check_working_tree", async () => {
        const status = await this.git(
          ["status", "--porcelain"],
          repositoryPath,
        );
        if (status.trim()) {
          const changedFiles = status.trim().split("\n").length;
          throw new Error(
            `Cannot apply snapshot: ${changedFiles} uncommitted change(s) exist. ` +
              `Commit or stash your changes first.`,
          );
        }
      });
    }

    // Step 3: Create temp directory (idempotent - mkdir with recursive does nothing if exists)
    await this.step({
      name: "create_tmp_dir",
      execute: () => mkdir(tmpDir, { recursive: true }),
      rollback: async () => {},
    });

    // Step 4: Download archive
    this.archivePath = join(tmpDir, `${snapshot.treeHash}.tar.gz`);
    await this.step({
      name: "download_archive",
      execute: async () => {
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

    // Step 5: Checkout base commit if present and different from current
    if (snapshot.baseCommit && snapshot.baseCommit !== this.originalHead) {
      await this.step({
        name: "checkout_base",
        execute: async () => {
          await this.git(["checkout", snapshot.baseCommit!], repositoryPath);
          this.log.warn(
            "Applied snapshot from different commit - now in detached HEAD state",
            {
              originalHead: this.originalHead,
              originalBranch: this.originalBranch,
              baseCommit: snapshot.baseCommit,
              tip: "Run 'git checkout <branch>' to return to a branch",
            },
          );
        },
        rollback: async () => {
          try {
            if (this.originalBranch) {
              await this.git(["checkout", this.originalBranch], repositoryPath);
            } else if (this.originalHead) {
              await this.git(["checkout", this.originalHead], repositoryPath);
            }
          } catch (error) {
            this.log.warn("Failed to rollback checkout", { error });
          }
        },
      });
    }

    // Step 6: Extract archive (adds/modifies files)
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

    // Step 7: Delete files marked as deleted
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
