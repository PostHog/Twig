import { Saga } from "@posthog/shared";
import { createGitClient } from "../client.js";

export interface CommitInput {
  baseDir: string;
  message: string;
  paths?: string[];
  allowEmpty?: boolean;
  signal?: AbortSignal;
}

export interface CommitOutput {
  commitSha: string;
  branch: string;
}

/** Stage files and create a commit. */
export class CommitSaga extends Saga<CommitInput, CommitOutput> {
  private previouslyStagedFiles: string[] = [];

  protected async execute(input: CommitInput): Promise<CommitOutput> {
    const { baseDir, message, paths, allowEmpty, signal } = input;
    const git = createGitClient(baseDir, { abortSignal: signal });

    // Record HEAD for rollback
    const originalHead = await this.readOnlyStep("get-original-head", () =>
      git.revparse(["HEAD"]),
    );

    // Get current branch
    const branch = await this.readOnlyStep("get-current-branch", () =>
      git.revparse(["--abbrev-ref", "HEAD"]),
    );

    this.previouslyStagedFiles = await this.readOnlyStep(
      "get-staged-files",
      async () => {
        const status = await git.status();
        return status.staged;
      },
    );

    // Stage files (rollback: restore previous staging state)
    await this.step({
      name: "stage-files",
      execute: () =>
        paths && paths.length > 0 ? git.add(paths) : git.add("-A"),
      rollback: async () => {
        await git.reset();
        if (this.previouslyStagedFiles.length > 0) {
          await git.add(this.previouslyStagedFiles);
        }
      },
    });

    // Create commit (rollback: reset to original HEAD)
    const commitResult = await this.step({
      name: "commit",
      execute: () =>
        allowEmpty
          ? git.commit(message, undefined, { "--allow-empty": null })
          : git.commit(message),
      rollback: async () => {
        await git.reset(["--soft", originalHead]);
      },
    });

    return { commitSha: commitResult.commit, branch };
  }
}

export interface StageAndCommitInput {
  baseDir: string;
  message: string;
  paths: string[];
  signal?: AbortSignal;
}

export interface StageAndCommitOutput {
  commitSha: string;
  branch: string;
  filesStaged: number;
}

/** Stage specific files and create a commit. */
export class StageAndCommitSaga extends Saga<
  StageAndCommitInput,
  StageAndCommitOutput
> {
  protected async execute(
    input: StageAndCommitInput,
  ): Promise<StageAndCommitOutput> {
    const { baseDir, message, paths, signal } = input;
    const git = createGitClient(baseDir, { abortSignal: signal });

    // Record HEAD for rollback
    const originalHead = await this.readOnlyStep("get-original-head", () =>
      git.revparse(["HEAD"]),
    );

    // Get current branch
    const branch = await this.readOnlyStep("get-current-branch", () =>
      git.revparse(["--abbrev-ref", "HEAD"]),
    );

    // Stage specific files (rollback: unstage them)
    await this.step({
      name: "stage-files",
      execute: () => git.add(paths),
      rollback: async () => {
        await git.reset(paths);
      },
    });

    // Create commit (rollback: reset to original HEAD)
    const commitResult = await this.step({
      name: "commit",
      execute: () => git.commit(message),
      rollback: async () => {
        await git.reset(["--soft", originalHead]);
      },
    });

    return {
      commitSha: commitResult.commit,
      branch,
      filesStaged: paths.length,
    };
  }
}
