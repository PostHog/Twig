import { Saga } from "@posthog/shared";
import { createGitClient } from "../client.js";

export interface CreateBranchInput {
  baseDir: string;
  branchName: string;
  baseBranch?: string;
  signal?: AbortSignal;
}

export interface CreateBranchOutput {
  branchName: string;
  baseBranch: string;
}

/** Create a new branch and check it out. */
export class CreateBranchSaga extends Saga<
  CreateBranchInput,
  CreateBranchOutput
> {
  protected async execute(
    input: CreateBranchInput,
  ): Promise<CreateBranchOutput> {
    const { baseDir, branchName, baseBranch, signal } = input;
    const git = createGitClient(baseDir, { abortSignal: signal });

    // Record current branch for rollback
    const originalBranch = await this.readOnlyStep("get-original-branch", () =>
      git.revparse(["--abbrev-ref", "HEAD"]),
    );

    // Determine base branch
    const base = baseBranch ?? originalBranch;

    // Create and checkout new branch (rollback: checkout original branch, delete new branch)
    await this.step({
      name: "create-branch",
      execute: () => git.checkoutBranch(branchName, base),
      rollback: async () => {
        await git.checkout(originalBranch);
        try {
          await git.deleteLocalBranch(branchName, true);
        } catch {
          // Branch may not exist if creation failed
        }
      },
    });

    return { branchName, baseBranch: base };
  }
}

export interface SwitchBranchInput {
  baseDir: string;
  branchName: string;
  signal?: AbortSignal;
}

export interface SwitchBranchOutput {
  previousBranch: string;
  currentBranch: string;
}

/** Switch to an existing branch. */
export class SwitchBranchSaga extends Saga<
  SwitchBranchInput,
  SwitchBranchOutput
> {
  protected async execute(
    input: SwitchBranchInput,
  ): Promise<SwitchBranchOutput> {
    const { baseDir, branchName, signal } = input;
    const git = createGitClient(baseDir, { abortSignal: signal });

    // Record current branch for rollback
    const originalBranch = await this.readOnlyStep("get-original-branch", () =>
      git.revparse(["--abbrev-ref", "HEAD"]),
    );

    // Switch to target branch (rollback: switch back to original)
    await this.step({
      name: "switch-branch",
      execute: () => git.checkout(branchName),
      rollback: async () => {
        await git.checkout(originalBranch);
      },
    });

    return { previousBranch: originalBranch, currentBranch: branchName };
  }
}

export interface CreateOrSwitchBranchInput {
  baseDir: string;
  branchName: string;
  baseBranch?: string;
  signal?: AbortSignal;
}

export interface CreateOrSwitchBranchOutput {
  branchName: string;
  created: boolean;
}

/** Create a branch if it doesn't exist, or switch to it if it does. */
export class CreateOrSwitchBranchSaga extends Saga<
  CreateOrSwitchBranchInput,
  CreateOrSwitchBranchOutput
> {
  protected async execute(
    input: CreateOrSwitchBranchInput,
  ): Promise<CreateOrSwitchBranchOutput> {
    const { baseDir, branchName, baseBranch, signal } = input;
    const git = createGitClient(baseDir, { abortSignal: signal });
    let branchCreated = false;

    // Record current branch for rollback
    const originalBranch = await this.readOnlyStep("get-original-branch", () =>
      git.revparse(["--abbrev-ref", "HEAD"]),
    );

    // Check if branch exists
    const branchExists = await this.readOnlyStep(
      "check-branch-exists",
      async () => {
        try {
          await git.revparse(["--verify", branchName]);
          return true;
        } catch {
          return false;
        }
      },
    );

    if (branchExists) {
      // Switch to existing branch (rollback: switch back)
      await this.step({
        name: "switch-to-existing",
        execute: () => git.checkout(branchName),
        rollback: async () => {
          await git.checkout(originalBranch);
        },
      });
    } else {
      // Get base branch
      const base = baseBranch ?? originalBranch;

      // Create and checkout new branch (rollback: checkout original, delete branch)
      await this.step({
        name: "create-new-branch",
        execute: async () => {
          await git.checkoutBranch(branchName, base);
          branchCreated = true;
        },
        rollback: async () => {
          await git.checkout(originalBranch);
          if (branchCreated) {
            try {
              await git.deleteLocalBranch(branchName, true);
            } catch {
              // Branch may not exist
            }
          }
        },
      });
    }

    return { branchName, created: !branchExists };
  }
}

export interface ResetToDefaultBranchInput {
  baseDir: string;
  signal?: AbortSignal;
}

export interface ResetToDefaultBranchOutput {
  previousBranch: string;
  defaultBranch: string;
  switched: boolean;
}

/** Switch to the default branch if not already on it. */
export class ResetToDefaultBranchSaga extends Saga<
  ResetToDefaultBranchInput,
  ResetToDefaultBranchOutput
> {
  protected async execute(
    input: ResetToDefaultBranchInput,
  ): Promise<ResetToDefaultBranchOutput> {
    const { baseDir, signal } = input;
    const git = createGitClient(baseDir, { abortSignal: signal });

    // Get current branch
    const originalBranch = await this.readOnlyStep("get-current-branch", () =>
      git.revparse(["--abbrev-ref", "HEAD"]),
    );

    // Determine default branch
    const defaultBranch = await this.readOnlyStep(
      "get-default-branch",
      async () => {
        try {
          const remoteBranch = await git.raw([
            "symbolic-ref",
            "refs/remotes/origin/HEAD",
          ]);
          return remoteBranch.trim().replace("refs/remotes/origin/", "");
        } catch {
          try {
            await git.revparse(["--verify", "main"]);
            return "main";
          } catch {
            try {
              await git.revparse(["--verify", "master"]);
              return "master";
            } catch {
              throw new Error("Cannot determine default branch");
            }
          }
        }
      },
    );

    // Already on default branch
    if (originalBranch === defaultBranch) {
      return { previousBranch: originalBranch, defaultBranch, switched: false };
    }

    // Check for uncommitted changes
    const hasChanges = await this.readOnlyStep("check-changes", async () => {
      const status = await git.status();
      return !status.isClean();
    });

    if (hasChanges) {
      throw new Error(
        "Uncommitted changes detected. Please commit or stash before switching branches.",
      );
    }

    // Switch to default branch (rollback: switch back)
    await this.step({
      name: "switch-to-default",
      execute: () => git.checkout(defaultBranch),
      rollback: async () => {
        await git.checkout(originalBranch);
      },
    });

    return { previousBranch: originalBranch, defaultBranch, switched: true };
  }
}
