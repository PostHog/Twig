import * as fs from "node:fs/promises";
import * as path from "node:path";
import { Saga } from "@posthog/shared";
import { createGitClient } from "../client.js";
import { branchExists, getDefaultBranch } from "../queries.js";

export interface CreateWorktreeInput {
  baseDir: string;
  worktreePath: string;
  branchName: string;
  baseBranch?: string;
  signal?: AbortSignal;
}

export interface CreateWorktreeOutput {
  worktreePath: string;
  branchName: string;
  baseBranch: string;
}

/** Create a new worktree with a new branch. */
export class CreateWorktreeSaga extends Saga<
  CreateWorktreeInput,
  CreateWorktreeOutput
> {
  protected async execute(
    input: CreateWorktreeInput,
  ): Promise<CreateWorktreeOutput> {
    const { baseDir, worktreePath, branchName, baseBranch, signal } = input;
    const git = createGitClient(baseDir, { abortSignal: signal });

    const base = await this.readOnlyStep("get-base-branch", async () => {
      if (baseBranch) return baseBranch;
      return getDefaultBranch(baseDir, { abortSignal: signal });
    });

    // Create worktree with new branch (rollback: remove worktree and branch)
    await this.step({
      name: "create-worktree",
      execute: () =>
        git.raw([
          "worktree",
          "add",
          "--quiet",
          "-b",
          branchName,
          worktreePath,
          base,
        ]),
      rollback: async () => {
        try {
          await git.raw(["worktree", "remove", worktreePath, "--force"]);
        } catch {
          await fs.rm(worktreePath, { recursive: true, force: true });
          await git.raw(["worktree", "prune"]);
        }
        try {
          await git.deleteLocalBranch(branchName, true);
        } catch {
          // Branch may not exist
        }
      },
    });

    await this.step({
      name: "symlink-claude-config",
      execute: async () => {
        const sourceClaudeDir = path.join(baseDir, ".claude");
        const targetClaudeDir = path.join(worktreePath, ".claude");
        try {
          await fs.access(sourceClaudeDir);
          await fs.symlink(sourceClaudeDir, targetClaudeDir, "dir");
        } catch {}
      },
      rollback: async () => {
        const targetClaudeDir = path.join(worktreePath, ".claude");
        await fs.rm(targetClaudeDir, { force: true }).catch(() => {});
      },
    });

    return { worktreePath, branchName, baseBranch: base };
  }
}

export interface CreateWorktreeForBranchInput {
  baseDir: string;
  worktreePath: string;
  branchName: string;
  signal?: AbortSignal;
}

export interface CreateWorktreeForBranchOutput {
  worktreePath: string;
  branchName: string;
}

/** Create a worktree for an existing branch (no new branch created). */
export class CreateWorktreeForBranchSaga extends Saga<
  CreateWorktreeForBranchInput,
  CreateWorktreeForBranchOutput
> {
  protected async execute(
    input: CreateWorktreeForBranchInput,
  ): Promise<CreateWorktreeForBranchOutput> {
    const { baseDir, worktreePath, branchName, signal } = input;
    const git = createGitClient(baseDir, { abortSignal: signal });

    await this.readOnlyStep("verify-branch-exists", async () => {
      const exists = await branchExists(baseDir, branchName, {
        abortSignal: signal,
      });
      if (!exists) {
        throw new Error(`Branch '${branchName}' does not exist`);
      }
    });

    // Create worktree for existing branch (rollback: remove worktree)
    await this.step({
      name: "create-worktree",
      execute: () =>
        git.raw(["worktree", "add", "--quiet", worktreePath, branchName]),
      rollback: async () => {
        try {
          await git.raw(["worktree", "remove", worktreePath, "--force"]);
        } catch {
          await fs.rm(worktreePath, { recursive: true, force: true });
          await git.raw(["worktree", "prune"]);
        }
      },
    });

    await this.step({
      name: "symlink-claude-config",
      execute: async () => {
        const sourceClaudeDir = path.join(baseDir, ".claude");
        const targetClaudeDir = path.join(worktreePath, ".claude");
        try {
          await fs.access(sourceClaudeDir);
          await fs.symlink(sourceClaudeDir, targetClaudeDir, "dir");
        } catch {}
      },
      rollback: async () => {
        const targetClaudeDir = path.join(worktreePath, ".claude");
        await fs.rm(targetClaudeDir, { force: true }).catch(() => {});
      },
    });

    return { worktreePath, branchName };
  }
}

export interface DeleteWorktreeInput {
  baseDir: string;
  worktreePath: string;
  signal?: AbortSignal;
}

export interface DeleteWorktreeOutput {
  deleted: boolean;
}

/** Delete a worktree with safety checks. */
export class DeleteWorktreeSaga extends Saga<
  DeleteWorktreeInput,
  DeleteWorktreeOutput
> {
  protected async execute(
    input: DeleteWorktreeInput,
  ): Promise<DeleteWorktreeOutput> {
    const { baseDir, worktreePath, signal } = input;
    const git = createGitClient(baseDir, { abortSignal: signal });

    const resolvedWorktreePath = path.resolve(worktreePath);
    const resolvedMainRepoPath = path.resolve(baseDir);

    // Safety checks (read-only, no rollback needed)
    await this.readOnlyStep("safety-checks", async () => {
      if (resolvedWorktreePath === resolvedMainRepoPath) {
        throw new Error("Cannot delete worktree: path matches main repo path");
      }
      if (
        resolvedMainRepoPath.startsWith(resolvedWorktreePath) &&
        resolvedMainRepoPath !== resolvedWorktreePath
      ) {
        throw new Error(
          "Cannot delete worktree: path is a parent of main repo path",
        );
      }
      try {
        const gitPath = path.join(resolvedWorktreePath, ".git");
        const stat = await fs.stat(gitPath);
        if (stat.isDirectory()) {
          throw new Error(
            "Cannot delete worktree: path appears to be a main repository",
          );
        }
      } catch (error) {
        if (
          error instanceof Error &&
          error.message.includes("Cannot delete worktree")
        ) {
          throw error;
        }
      }
    });

    // Delete worktree (no rollback - destructive operation)
    await this.step({
      name: "delete-worktree",
      execute: async () => {
        try {
          await git.raw(["worktree", "remove", worktreePath, "--force"]);
        } catch {
          await fs.rm(worktreePath, { recursive: true, force: true });
          await git.raw(["worktree", "prune"]);
        }
      },
      rollback: async () => {},
    });

    return { deleted: true };
  }
}
