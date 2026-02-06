import { existsSync } from "node:fs";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as tar from "tar";
import type { GitClient } from "../client.js";
import { GitSaga, type GitSagaInput } from "../git-saga.js";
import { getHeadSha } from "../queries.js";

export type FileStatus = "A" | "M" | "D";

export interface FileChange {
  path: string;
  status: FileStatus;
}

export interface TreeSnapshot {
  treeHash: string;
  baseCommit: string | null;
  changes: FileChange[];
  timestamp: string;
}

export interface CaptureTreeInput extends GitSagaInput {
  lastTreeHash?: string | null;
  archivePath?: string;
}

export interface CaptureTreeOutput {
  snapshot: TreeSnapshot | null;
  archivePath?: string;
  changed: boolean;
}

export class CaptureTreeSaga extends GitSaga<
  CaptureTreeInput,
  CaptureTreeOutput
> {
  private tempIndexPath: string | null = null;

  protected async executeGitOperations(
    input: CaptureTreeInput,
  ): Promise<CaptureTreeOutput> {
    const { baseDir, lastTreeHash, archivePath, signal } = input;
    const tmpDir = path.join(baseDir, ".git", "twig-tmp");

    await this.step({
      name: "create_tmp_dir",
      execute: () => fs.mkdir(tmpDir, { recursive: true }),
      rollback: async () => {},
    });

    this.tempIndexPath = path.join(tmpDir, `index-${Date.now()}`);
    const tempIndexGit = this.git.env({
      ...process.env,
      GIT_INDEX_FILE: this.tempIndexPath,
    });

    await this.step({
      name: "init_temp_index",
      execute: () => tempIndexGit.raw(["read-tree", "HEAD"]),
      rollback: async () => {
        if (this.tempIndexPath) {
          await fs.rm(this.tempIndexPath, { force: true }).catch(() => {});
        }
      },
    });

    await this.readOnlyStep("stage_files", () =>
      tempIndexGit.raw(["add", "-A"]),
    );

    const treeHash = await this.readOnlyStep("write_tree", () =>
      tempIndexGit.raw(["write-tree"]),
    );

    if (lastTreeHash && treeHash === lastTreeHash) {
      this.log.debug("No changes since last capture", { treeHash });
      await fs.rm(this.tempIndexPath, { force: true }).catch(() => {});
      return { snapshot: null, changed: false };
    }

    const baseCommit = await this.readOnlyStep("get_base_commit", async () => {
      try {
        return await getHeadSha(baseDir, { abortSignal: signal });
      } catch {
        return null;
      }
    });

    const changes = await this.readOnlyStep("get_changes", () =>
      this.getChanges(this.git, baseCommit, treeHash),
    );

    await fs.rm(this.tempIndexPath, { force: true }).catch(() => {});

    const snapshot: TreeSnapshot = {
      treeHash,
      baseCommit,
      changes,
      timestamp: new Date().toISOString(),
    };

    let createdArchivePath: string | undefined;
    if (archivePath) {
      createdArchivePath = await this.createArchive(
        baseDir,
        archivePath,
        changes,
      );
    }

    this.log.info("Tree captured", {
      treeHash,
      changes: changes.length,
      archived: !!createdArchivePath,
    });

    return { snapshot, archivePath: createdArchivePath, changed: true };
  }

  private async createArchive(
    baseDir: string,
    archivePath: string,
    changes: FileChange[],
  ): Promise<string | undefined> {
    const filesToArchive = changes
      .filter((c) => c.status !== "D")
      .map((c) => c.path);

    if (filesToArchive.length === 0) {
      return undefined;
    }

    const existingFiles = filesToArchive.filter((f) =>
      existsSync(path.join(baseDir, f)),
    );

    if (existingFiles.length === 0) {
      return undefined;
    }

    await this.step({
      name: "create_archive",
      execute: async () => {
        const archiveDir = path.dirname(archivePath);
        await fs.mkdir(archiveDir, { recursive: true });
        await tar.create(
          {
            gzip: true,
            file: archivePath,
            cwd: baseDir,
          },
          existingFiles,
        );
      },
      rollback: async () => {
        await fs.rm(archivePath, { force: true }).catch(() => {});
      },
    });

    return archivePath;
  }

  private async getChanges(
    git: GitClient,
    fromRef: string | null,
    toRef: string,
  ): Promise<FileChange[]> {
    if (!fromRef) {
      const stdout = await git.raw(["ls-tree", "-r", "--name-only", toRef]);
      return stdout
        .split("\n")
        .filter((p) => p.trim())
        .map((p) => ({ path: p, status: "A" as FileStatus }));
    }

    const stdout = await git.raw([
      "diff-tree",
      "-r",
      "--name-status",
      fromRef,
      toRef,
    ]);

    const changes: FileChange[] = [];
    for (const line of stdout.split("\n")) {
      if (!line.trim()) continue;
      const [status, filePath] = line.split("\t");
      if (!filePath) continue;

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

export interface ApplyTreeInput extends GitSagaInput {
  treeHash: string;
  baseCommit?: string | null;
  changes: FileChange[];
  archivePath?: string;
}

export interface ApplyTreeOutput {
  treeHash: string;
  checkoutPerformed: boolean;
}

export class ApplyTreeSaga extends GitSaga<ApplyTreeInput, ApplyTreeOutput> {
  private originalHead: string | null = null;
  private originalBranch: string | null = null;
  private extractedFiles: string[] = [];
  private fileBackups: Map<string, Buffer> = new Map();

  protected async executeGitOperations(
    input: ApplyTreeInput,
  ): Promise<ApplyTreeOutput> {
    const { baseDir, treeHash, baseCommit, changes, archivePath } = input;

    const headInfo = await this.readOnlyStep("get_current_head", async () => {
      let head: string | null = null;
      let branch: string | null = null;

      try {
        head = await this.git.revparse(["HEAD"]);
      } catch {
        head = null;
      }

      try {
        branch = await this.git.raw(["symbolic-ref", "--short", "HEAD"]);
      } catch {
        branch = null;
      }

      return { head, branch };
    });
    this.originalHead = headInfo.head;
    this.originalBranch = headInfo.branch;

    let checkoutPerformed = false;

    if (baseCommit && baseCommit !== this.originalHead) {
      await this.readOnlyStep("check_working_tree", async () => {
        const status = await this.git.status();
        if (!status.isClean()) {
          const changedFiles =
            status.modified.length +
            status.staged.length +
            status.deleted.length;
          throw new Error(
            `Cannot apply tree: ${changedFiles} uncommitted change(s) exist. ` +
              `Commit or stash your changes first.`,
          );
        }
      });

      await this.step({
        name: "checkout_base",
        execute: async () => {
          await this.git.checkout(baseCommit);
          checkoutPerformed = true;
          this.log.warn(
            "Applied tree from different commit - now in detached HEAD state",
            {
              originalHead: this.originalHead,
              originalBranch: this.originalBranch,
              baseCommit,
            },
          );
        },
        rollback: async () => {
          try {
            if (this.originalBranch) {
              await this.git.checkout(this.originalBranch);
            } else if (this.originalHead) {
              await this.git.checkout(this.originalHead);
            }
          } catch (error) {
            this.log.warn("Failed to rollback checkout", { error });
          }
        },
      });
    }

    if (archivePath) {
      const filesToExtract = changes
        .filter((c) => c.status !== "D")
        .map((c) => c.path);

      await this.readOnlyStep("backup_existing_files", async () => {
        for (const filePath of filesToExtract) {
          const fullPath = path.join(baseDir, filePath);
          try {
            const content = await fs.readFile(fullPath);
            this.fileBackups.set(filePath, content);
          } catch {}
        }
      });

      await this.step({
        name: "extract_archive",
        execute: async () => {
          await tar.extract({
            file: archivePath,
            cwd: baseDir,
          });
          this.extractedFiles = filesToExtract;
        },
        rollback: async () => {
          for (const filePath of this.extractedFiles) {
            const fullPath = path.join(baseDir, filePath);
            const backup = this.fileBackups.get(filePath);
            if (backup) {
              const dir = path.dirname(fullPath);
              await fs.mkdir(dir, { recursive: true }).catch(() => {});
              await fs.writeFile(fullPath, backup).catch(() => {});
            } else {
              await fs.rm(fullPath, { force: true }).catch(() => {});
            }
          }
        },
      });
    }

    for (const change of changes.filter((c) => c.status === "D")) {
      const fullPath = path.join(baseDir, change.path);

      const backupContent = await this.readOnlyStep(
        `backup_${change.path}`,
        async () => {
          try {
            return await fs.readFile(fullPath);
          } catch {
            return null;
          }
        },
      );

      await this.step({
        name: `delete_${change.path}`,
        execute: async () => {
          await fs.rm(fullPath, { force: true });
          this.log.debug(`Deleted file: ${change.path}`);
        },
        rollback: async () => {
          if (backupContent) {
            const dir = path.dirname(fullPath);
            await fs.mkdir(dir, { recursive: true }).catch(() => {});
            await fs.writeFile(fullPath, backupContent).catch(() => {});
          }
        },
      });
    }

    const deletedCount = changes.filter((c) => c.status === "D").length;
    this.log.info("Tree applied", {
      treeHash,
      totalChanges: changes.length,
      deletedFiles: deletedCount,
      checkoutPerformed,
    });

    return { treeHash, checkoutPerformed };
  }
}

export interface ReadTreeInput extends GitSagaInput {
  treeHash: string;
}

export interface ReadTreeOutput {
  files: string[];
}

export class ReadTreeSaga extends GitSaga<ReadTreeInput, ReadTreeOutput> {
  protected async executeGitOperations(
    input: ReadTreeInput,
  ): Promise<ReadTreeOutput> {
    const { treeHash } = input;

    const stdout = await this.readOnlyStep("ls_tree", () =>
      this.git.raw(["ls-tree", "-r", "--name-only", treeHash]),
    );

    const files = stdout.split("\n").filter((f) => f.trim());
    return { files };
  }
}
