import * as fs from "node:fs/promises";
import * as path from "node:path";
import { Saga } from "@posthog/shared";
import { createGitClient } from "../client.js";

export interface CleanWorkingTreeInput {
  baseDir: string;
  signal?: AbortSignal;
}

export interface CleanWorkingTreeOutput {
  cleaned: boolean;
  backupStashSha: string | null;
}

async function cleanStaleLockFile(repoPath: string): Promise<void> {
  const lockPath = path.join(repoPath, ".git", "index.lock");
  try {
    const stat = await fs.stat(lockPath);
    const ageMs = Date.now() - stat.mtimeMs;
    if (ageMs > 2000) {
      await fs.rm(lockPath);
    }
  } catch {}
}

async function forceRemoveLockFile(repoPath: string): Promise<void> {
  const lockPath = path.join(repoPath, ".git", "index.lock");
  try {
    await fs.rm(lockPath);
  } catch {}
}

/** Reset, restore, and clean working tree to match HEAD. */
export class CleanWorkingTreeSaga extends Saga<
  CleanWorkingTreeInput,
  CleanWorkingTreeOutput
> {
  private backupStashCreated = false;
  private stashCountBefore = 0;

  private async restoreBackupStash(
    git: ReturnType<typeof createGitClient>,
  ): Promise<void> {
    if (this.backupStashCreated) {
      await git.stash(["pop"]).catch(() => {});
      this.backupStashCreated = false;
    }
  }

  protected async execute(
    input: CleanWorkingTreeInput,
  ): Promise<CleanWorkingTreeOutput> {
    const { baseDir, signal } = input;
    const git = createGitClient(baseDir, { abortSignal: signal });

    await cleanStaleLockFile(baseDir);

    const hasChanges = await this.readOnlyStep("check-changes", async () => {
      const status = await git.status();
      return !status.isClean();
    });

    if (hasChanges) {
      this.stashCountBefore = await this.readOnlyStep(
        "get-stash-count",
        async () => {
          const result = await git.stashList();
          return result.all.length;
        },
      );

      await this.step({
        name: "backup-changes",
        execute: async () => {
          await git.add("-A");
          await git.stash([
            "push",
            "--include-untracked",
            "-m",
            "twig-clean-backup",
          ]);
          const afterResult = await git.stashList();
          this.backupStashCreated =
            afterResult.all.length > this.stashCountBefore;
        },
        rollback: () => this.restoreBackupStash(git),
      });
    }

    await this.step({
      name: "reset-index",
      execute: () => git.reset(),
      rollback: () => this.restoreBackupStash(git),
    });

    await this.step({
      name: "restore-working-tree",
      execute: () => git.raw(["restore", "."]),
      rollback: () => this.restoreBackupStash(git),
    });

    await this.step({
      name: "clean-untracked",
      execute: () => git.clean(["f", "d"]),
      rollback: () => this.restoreBackupStash(git),
    });

    await forceRemoveLockFile(baseDir);

    let backupStashSha: string | null = null;
    if (this.backupStashCreated) {
      backupStashSha = await this.readOnlyStep("get-backup-sha", async () => {
        try {
          return await git.revparse(["stash@{0}"]);
        } catch {
          return null;
        }
      });
    }

    return { cleaned: true, backupStashSha };
  }
}
