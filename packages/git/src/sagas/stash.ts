import { Saga } from "@posthog/shared";
import { createGitClient } from "../client.js";

export interface StashPushInput {
  baseDir: string;
  message: string;
  signal?: AbortSignal;
}

export interface StashPushOutput {
  stashSha: string | null;
}

/** Stage all changes and stash them with a message. */
export class StashPushSaga extends Saga<StashPushInput, StashPushOutput> {
  private previouslyStagedFiles: string[] = [];

  protected async execute(input: StashPushInput): Promise<StashPushOutput> {
    const { baseDir, message, signal } = input;
    const git = createGitClient(baseDir, { abortSignal: signal });

    // Count stashes before to detect if new stash was created
    const beforeCount = await this.readOnlyStep(
      "get-before-count",
      async () => {
        const result = await git.stashList();
        return result.all.length;
      },
    );

    this.previouslyStagedFiles = await this.readOnlyStep(
      "get-staged-files",
      async () => {
        const status = await git.status();
        return status.staged;
      },
    );

    // Stage all changes (rollback: restore previous staging state)
    await this.step({
      name: "stage-all",
      execute: () => git.add("-A"),
      rollback: async () => {
        await git.reset();
        if (this.previouslyStagedFiles.length > 0) {
          await git.add(this.previouslyStagedFiles);
        }
      },
    });

    // Stash with message (rollback: pop if stash was created)
    await this.step({
      name: "stash-push",
      execute: () => git.stash(["push", "--include-untracked", "-m", message]),
      rollback: async () => {
        const afterResult = await git.stashList();
        if (afterResult.all.length > beforeCount) {
          await git.stash(["pop"]);
        }
      },
    });

    // Get SHA of new stash if one was created
    const stashSha = await this.readOnlyStep("get-stash-sha", async () => {
      const afterResult = await git.stashList();
      if (afterResult.all.length > beforeCount) {
        return git.revparse(["stash@{0}"]);
      }
      return null;
    });

    return { stashSha };
  }
}

export interface StashApplyInput {
  baseDir: string;
  stashSha: string;
  signal?: AbortSignal;
}

export interface StashApplyOutput {
  dropped: boolean;
}

/** Apply a stash by SHA and drop it from the stash list. */
export class StashApplySaga extends Saga<StashApplyInput, StashApplyOutput> {
  private backupStashCreated = false;
  private stashCountBeforeBackup = 0;

  protected async execute(input: StashApplyInput): Promise<StashApplyOutput> {
    const { baseDir, stashSha, signal } = input;
    const git = createGitClient(baseDir, { abortSignal: signal });

    const hasExistingChanges = await this.readOnlyStep(
      "check-existing-changes",
      async () => {
        const status = await git.status();
        return !status.isClean();
      },
    );

    if (hasExistingChanges) {
      this.stashCountBeforeBackup = await this.readOnlyStep(
        "get-stash-count-before-backup",
        async () => {
          const result = await git.stashList();
          return result.all.length;
        },
      );

      await this.step({
        name: "backup-existing-changes",
        execute: async () => {
          await git.stash([
            "push",
            "--include-untracked",
            "-m",
            "twig-stash-apply-backup",
          ]);
          const afterResult = await git.stashList();
          this.backupStashCreated =
            afterResult.all.length > this.stashCountBeforeBackup;
        },
        rollback: async () => {
          if (this.backupStashCreated) {
            await git.stash(["pop"]).catch(() => {});
          }
        },
      });
    }

    await this.step({
      name: "apply-stash",
      execute: () => git.stash(["apply", stashSha]),
      rollback: async () => {
        await git.reset(["--hard"]);
        await git.clean(["f", "d"]);
        if (this.backupStashCreated) {
          await git.stash(["pop"]).catch(() => {});
          this.backupStashCreated = false;
        }
      },
    });

    if (this.backupStashCreated) {
      await this.step({
        name: "restore-backup",
        execute: async () => {
          await git.stash(["pop"]);
          this.backupStashCreated = false;
        },
        rollback: async () => {},
      });
    }

    const stashIndex = await this.readOnlyStep("find-stash-index", async () => {
      const result = await git.raw([
        "reflog",
        "show",
        "--format=%H %gd",
        "refs/stash",
      ]);
      const match = result
        .split("\n")
        .find((line) => line.startsWith(stashSha));
      return match ? match.split(" ")[1] : null;
    });

    let dropped = false;
    if (stashIndex) {
      await this.step({
        name: "drop-stash",
        execute: async () => {
          await git.stash(["drop", stashIndex]);
          dropped = true;
        },
        rollback: async () => {},
      });
    }

    return { dropped };
  }
}

export interface StashPopInput {
  baseDir: string;
  signal?: AbortSignal;
}

export interface StashPopOutput {
  popped: boolean;
}

/** Pop the most recent stash entry. */
export class StashPopSaga extends Saga<StashPopInput, StashPopOutput> {
  private stashSha: string | null = null;
  private stashMessage: string | null = null;

  protected async execute(input: StashPopInput): Promise<StashPopOutput> {
    const { baseDir, signal } = input;
    const git = createGitClient(baseDir, { abortSignal: signal });

    const stashInfo = await this.readOnlyStep("get-stash-info", async () => {
      try {
        const sha = await git.revparse(["stash@{0}"]);
        const result = await git.stashList();
        const message =
          result.all.length > 0
            ? result.all[0].message || "twig-stash-pop-restore"
            : "twig-stash-pop-restore";
        return { sha, message };
      } catch {
        return { sha: null, message: "twig-stash-pop-restore" };
      }
    });
    this.stashSha = stashInfo.sha;
    this.stashMessage = stashInfo.message;

    await this.step({
      name: "stash-pop",
      execute: () => git.stash(["pop"]),
      rollback: async () => {
        if (!this.stashSha || !this.stashMessage) return;
        await git.reset(["--hard"]).catch(() => {});
        await git.clean(["f", "d"]).catch(() => {});
        await git
          .raw(["stash", "store", "-m", this.stashMessage, this.stashSha])
          .catch(() => {});
      },
    });

    return { popped: true };
  }
}
