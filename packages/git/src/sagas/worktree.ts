import * as fs from "node:fs/promises";
import * as path from "node:path";
import { GitSaga, type GitSagaInput } from "../git-saga.js";
import {
  addToLocalExclude,
  branchExists,
  getDefaultBranch,
} from "../queries.js";
import { safeSymlink } from "../utils.js";

export interface CreateWorktreeInput extends GitSagaInput {
  worktreePath: string;
  branchName: string;
  baseBranch?: string;
}

export interface CreateWorktreeOutput {
  worktreePath: string;
  branchName: string;
  baseBranch: string;
}

export class CreateWorktreeSaga extends GitSaga<
  CreateWorktreeInput,
  CreateWorktreeOutput
> {
  protected async executeGitOperations(
    input: CreateWorktreeInput,
  ): Promise<CreateWorktreeOutput> {
    const { baseDir, worktreePath, branchName, baseBranch, signal } = input;

    const base = await this.readOnlyStep("get-base-branch", async () => {
      if (baseBranch) return baseBranch;
      return getDefaultBranch(baseDir, { abortSignal: signal });
    });

    await this.step({
      name: "create-worktree",
      execute: () =>
        this.git.raw([
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
          await this.git.raw(["worktree", "remove", worktreePath, "--force"]);
        } catch {
          await fs.rm(worktreePath, { recursive: true, force: true });
          await this.git.raw(["worktree", "prune"]);
        }
        try {
          await this.git.deleteLocalBranch(branchName, true);
        } catch {}
      },
    });

    await this.step({
      name: "symlink-claude-config",
      execute: async () => {
        const sourceClaudeDir = path.join(baseDir, ".claude");
        const targetClaudeDir = path.join(worktreePath, ".claude");
        const linkedDir = await safeSymlink(
          sourceClaudeDir,
          targetClaudeDir,
          "dir",
        );
        if (linkedDir) {
          await addToLocalExclude(worktreePath, ".claude", {
            abortSignal: signal,
          });
        }

        const sourceClaudeLocalMd = path.join(baseDir, "CLAUDE.local.md");
        const targetClaudeLocalMd = path.join(worktreePath, "CLAUDE.local.md");
        const linkedFile = await safeSymlink(
          sourceClaudeLocalMd,
          targetClaudeLocalMd,
          "file",
        );
        if (linkedFile) {
          await addToLocalExclude(worktreePath, "CLAUDE.local.md", {
            abortSignal: signal,
          });
        }
      },
      rollback: async () => {
        const targetClaudeDir = path.join(worktreePath, ".claude");
        const targetClaudeLocalMd = path.join(worktreePath, "CLAUDE.local.md");
        await fs.rm(targetClaudeDir, { force: true }).catch(() => {});
        await fs.rm(targetClaudeLocalMd, { force: true }).catch(() => {});
      },
    });

    return { worktreePath, branchName, baseBranch: base };
  }
}

export interface CreateWorktreeForBranchInput extends GitSagaInput {
  worktreePath: string;
  branchName: string;
}

export interface CreateWorktreeForBranchOutput {
  worktreePath: string;
  branchName: string;
}

export class CreateWorktreeForBranchSaga extends GitSaga<
  CreateWorktreeForBranchInput,
  CreateWorktreeForBranchOutput
> {
  protected async executeGitOperations(
    input: CreateWorktreeForBranchInput,
  ): Promise<CreateWorktreeForBranchOutput> {
    const { baseDir, worktreePath, branchName, signal } = input;

    await this.readOnlyStep("verify-branch-exists", async () => {
      const exists = await branchExists(baseDir, branchName, {
        abortSignal: signal,
      });
      if (!exists) {
        throw new Error(`Branch '${branchName}' does not exist`);
      }
    });

    await this.step({
      name: "create-worktree",
      execute: () =>
        this.git.raw(["worktree", "add", "--quiet", worktreePath, branchName]),
      rollback: async () => {
        try {
          await this.git.raw(["worktree", "remove", worktreePath, "--force"]);
        } catch {
          await fs.rm(worktreePath, { recursive: true, force: true });
          await this.git.raw(["worktree", "prune"]);
        }
      },
    });

    await this.step({
      name: "symlink-claude-config",
      execute: async () => {
        const sourceClaudeDir = path.join(baseDir, ".claude");
        const targetClaudeDir = path.join(worktreePath, ".claude");
        const linkedDir = await safeSymlink(
          sourceClaudeDir,
          targetClaudeDir,
          "dir",
        );
        if (linkedDir) {
          await addToLocalExclude(worktreePath, ".claude", {
            abortSignal: signal,
          });
        }

        const sourceClaudeLocalMd = path.join(baseDir, "CLAUDE.local.md");
        const targetClaudeLocalMd = path.join(worktreePath, "CLAUDE.local.md");
        const linkedFile = await safeSymlink(
          sourceClaudeLocalMd,
          targetClaudeLocalMd,
          "file",
        );
        if (linkedFile) {
          await addToLocalExclude(worktreePath, "CLAUDE.local.md", {
            abortSignal: signal,
          });
        }
      },
      rollback: async () => {
        const targetClaudeDir = path.join(worktreePath, ".claude");
        const targetClaudeLocalMd = path.join(worktreePath, "CLAUDE.local.md");
        await fs.rm(targetClaudeDir, { force: true }).catch(() => {});
        await fs.rm(targetClaudeLocalMd, { force: true }).catch(() => {});
      },
    });

    return { worktreePath, branchName };
  }
}

export interface DeleteWorktreeInput extends GitSagaInput {
  worktreePath: string;
}

export interface DeleteWorktreeOutput {
  deleted: boolean;
}

export class DeleteWorktreeSaga extends GitSaga<
  DeleteWorktreeInput,
  DeleteWorktreeOutput
> {
  protected async executeGitOperations(
    input: DeleteWorktreeInput,
  ): Promise<DeleteWorktreeOutput> {
    const { baseDir, worktreePath } = input;

    const resolvedWorktreePath = path.resolve(worktreePath);
    const resolvedMainRepoPath = path.resolve(baseDir);

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

    await this.step({
      name: "delete-worktree",
      execute: async () => {
        try {
          await this.git.raw(["worktree", "remove", worktreePath, "--force"]);
        } catch {
          await fs.rm(worktreePath, { recursive: true, force: true });
          await this.git.raw(["worktree", "prune"]);
        }
      },
      rollback: async () => {},
    });

    return { deleted: true };
  }
}
