import { Saga } from "@posthog/shared";
import { createGitClient } from "../client.js";

export interface SyncInput {
  baseDir: string;
  remote?: string;
  branch?: string;
  signal?: AbortSignal;
}

export interface SyncOutput {
  pullSummary: {
    changes: number;
    insertions: number;
    deletions: number;
  };
  pushBranch: string;
}

/** Pull then push to synchronize local branch with remote. */
export class SyncSaga extends Saga<SyncInput, SyncOutput> {
  private stashCreated = false;

  protected async execute(input: SyncInput): Promise<SyncOutput> {
    const { baseDir, remote = "origin", branch, signal } = input;
    const git = createGitClient(baseDir, { abortSignal: signal });

    const originalHead = await this.readOnlyStep("get-original-head", () =>
      git.revparse(["HEAD"]),
    );

    const hasChanges = await this.readOnlyStep("check-changes", async () => {
      const status = await git.status();
      return !status.isClean();
    });

    if (hasChanges) {
      const stashCountBefore = await this.readOnlyStep(
        "get-stash-count",
        async () => {
          const result = await git.stashList();
          return result.all.length;
        },
      );

      await this.step({
        name: "stash-changes",
        execute: async () => {
          await git.stash([
            "push",
            "--include-untracked",
            "-m",
            "twig-sync-backup",
          ]);
          const afterResult = await git.stashList();
          this.stashCreated = afterResult.all.length > stashCountBefore;
        },
        rollback: async () => {
          if (this.stashCreated) {
            await git.stash(["pop"]).catch(() => {});
          }
        },
      });
    }

    const currentBranch = await this.readOnlyStep(
      "get-current-branch",
      async () => branch ?? git.revparse(["--abbrev-ref", "HEAD"]),
    );

    const pullResult = await this.step({
      name: "pull",
      execute: () => git.pull(remote, currentBranch),
      rollback: async () => {
        await git.reset(["--hard", originalHead]);
        if (this.stashCreated) {
          await git.stash(["pop"]).catch(() => {});
          this.stashCreated = false;
        }
      },
    });

    await this.step({
      name: "push",
      execute: () => git.push(remote, currentBranch),
      rollback: async () => {},
    });

    if (this.stashCreated) {
      await this.step({
        name: "restore-stash",
        execute: async () => {
          await git.stash(["pop"]);
          this.stashCreated = false;
        },
        rollback: async () => {},
      });
    }

    return {
      pullSummary: {
        changes: pullResult.summary.changes,
        insertions: pullResult.summary.insertions,
        deletions: pullResult.summary.deletions,
      },
      pushBranch: currentBranch,
    };
  }
}
