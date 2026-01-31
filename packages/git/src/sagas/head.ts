import { Saga } from "@posthog/shared";
import { createGitClient } from "../client.js";

export interface DetachHeadInput {
  baseDir: string;
  signal?: AbortSignal;
}

export interface DetachHeadOutput {
  previousBranch: string | null;
  detachedAt: string;
}

/** Detach HEAD from current branch. */
export class DetachHeadSaga extends Saga<DetachHeadInput, DetachHeadOutput> {
  protected async execute(input: DetachHeadInput): Promise<DetachHeadOutput> {
    const { baseDir, signal } = input;
    const git = createGitClient(baseDir, { abortSignal: signal });

    const previousBranch = await this.readOnlyStep(
      "get-current-branch",
      async () => {
        const branch = await git.revparse(["--abbrev-ref", "HEAD"]);
        return branch === "HEAD" ? null : branch;
      },
    );

    const commitSha = await this.readOnlyStep("get-head-sha", () =>
      git.revparse(["HEAD"]),
    );

    await this.step({
      name: "detach-head",
      execute: () => git.checkout(["--detach"]),
      rollback: async () => {
        if (previousBranch) {
          await git.checkout(previousBranch);
        }
      },
    });

    return { previousBranch, detachedAt: commitSha };
  }
}

export interface ReattachBranchInput {
  baseDir: string;
  branchName: string;
  signal?: AbortSignal;
}

export interface ReattachBranchOutput {
  branchName: string;
}

/** Reattach to a branch (checkout -B to force update branch to current HEAD). */
export class ReattachBranchSaga extends Saga<
  ReattachBranchInput,
  ReattachBranchOutput
> {
  private branchExistedBefore = false;
  private originalBranchSha: string | null = null;

  protected async execute(
    input: ReattachBranchInput,
  ): Promise<ReattachBranchOutput> {
    const { baseDir, branchName, signal } = input;
    const git = createGitClient(baseDir, { abortSignal: signal });

    const originalHead = await this.readOnlyStep("get-head-sha", () =>
      git.revparse(["HEAD"]),
    );

    const branchInfo = await this.readOnlyStep(
      "check-branch-exists",
      async () => {
        try {
          const sha = await git.revparse([branchName]);
          return { exists: true, sha };
        } catch {
          return { exists: false, sha: null };
        }
      },
    );
    this.branchExistedBefore = branchInfo.exists;
    this.originalBranchSha = branchInfo.sha;

    await this.step({
      name: "reattach-branch",
      execute: () => git.checkout(["-B", branchName]),
      rollback: async () => {
        await git.checkout(["--detach", originalHead]);
        if (this.branchExistedBefore && this.originalBranchSha) {
          await git.raw(["branch", "-f", branchName, this.originalBranchSha]);
        } else if (!this.branchExistedBefore) {
          await git.deleteLocalBranch(branchName, true).catch(() => {});
        }
      },
    });

    return { branchName };
  }
}
