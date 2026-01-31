import { Saga } from "@posthog/shared";
import { createGitClient } from "../client.js";

export interface PullInput {
  baseDir: string;
  remote?: string;
  branch?: string;
  signal?: AbortSignal;
}

export interface PullOutput {
  changes: number;
  insertions: number;
  deletions: number;
}

export class PullSaga extends Saga<PullInput, PullOutput> {
  private stashCreated = false;

  protected async execute(input: PullInput): Promise<PullOutput> {
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
            "twig-pull-backup",
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

    const targetBranch =
      branch ?? (await git.revparse(["--abbrev-ref", "HEAD"]));

    const result = await this.step({
      name: "pull",
      execute: () =>
        git.pull(remote, targetBranch === "HEAD" ? undefined : targetBranch),
      rollback: async () => {
        await git.reset(["--hard", originalHead]);
        if (this.stashCreated) {
          await git.stash(["pop"]).catch(() => {});
          this.stashCreated = false;
        }
      },
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
      changes: result.summary.changes,
      insertions: result.summary.insertions,
      deletions: result.summary.deletions,
    };
  }
}
