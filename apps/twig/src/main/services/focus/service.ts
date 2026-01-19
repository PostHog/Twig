import { exec, execFile } from "node:child_process";
import { stat } from "node:fs/promises";
import { promisify } from "node:util";
import type { SagaLogger } from "@shared/lib/saga.js";
import { inject, injectable } from "inversify";
import { MAIN_TOKENS } from "../../di/tokens.js";
import { logger } from "../../lib/logger";
import { DisableFocusSaga, EnableFocusSaga } from "./sagas.js";
import {
  type FocusRefData,
  type FocusResult,
  type FocusState,
  focusRefDataSchema,
  type GitOperationResult,
  type StashResult,
} from "./schemas.js";
import type { FocusSyncService } from "./sync-service.js";

const execFileAsync = promisify(execFile);
const execAsync = promisify(exec);

const log = logger.scope("focus");

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function pathExists(p: string): Promise<boolean> {
  try {
    await stat(p);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return false;
    }
    throw error;
  }
}

export async function git(cwd: string, ...args: string[]): Promise<string> {
  const { stdout } = await execFileAsync("git", args, { cwd });
  return stdout.trim();
}

async function gitOp<T extends GitOperationResult>(
  operation: string,
  fn: () => Promise<T>,
): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    const message = getErrorMessage(error);
    log.error(`${operation}:`, message);
    return { success: false, error: `${operation}: ${message}` } as T;
  }
}

const DISABLED_STATE: FocusState = { enabled: false };

@injectable()
export class FocusService {
  private state: FocusState = DISABLED_STATE;
  private readonly FOCUS_REF = "refs/twig/focus";

  constructor(
    @inject(MAIN_TOKENS.FocusSyncService)
    private readonly syncService: FocusSyncService,
  ) {}

  /**
   * Restore focus state on app startup.
   * Derives branch from main's current branch, worktreePath from git worktree list.
   */
  async restoreFocusState(mainRepoPath: string): Promise<FocusResult> {
    try {
      const refData = await this.readFocusRef(mainRepoPath);
      if (!refData) {
        return { success: true };
      }

      const branch = await this.getCurrentBranch(mainRepoPath);
      if (!branch) {
        log.warn("Main repo is in detached HEAD state, clearing focus ref");
        await this.deleteFocusRef(mainRepoPath);
        return { success: true };
      }

      if (branch === refData.originalBranch) {
        log.info("Main repo is on original branch, focus not active");
        await this.deleteFocusRef(mainRepoPath);
        return { success: true };
      }

      const worktreePath = await this.findWorktreeByBranch(
        mainRepoPath,
        branch,
      );
      if (!worktreePath) {
        log.warn(
          `No detached worktree found for branch ${branch}, clearing ref`,
        );
        await this.deleteFocusRef(mainRepoPath);
        return { success: true };
      }

      log.info(
        `Restoring focus state: branch=${branch}, worktree=${worktreePath}`,
      );

      this.state = {
        enabled: true,
        workspaceId: "", // Will be populated by caller if needed
        branch,
        mainRepoPath,
        worktreePath,
        originalBranch: refData.originalBranch,
        mainStashRef: refData.mainStashRef,
      };

      try {
        await this.syncService.startSync(mainRepoPath, worktreePath);
      } catch (error) {
        log.warn("Failed to restart sync service:", error);
      }

      return { success: true };
    } catch (error) {
      const msg = getErrorMessage(error);
      log.error("Failed to restore focus state:", msg);
      return { success: false, error: msg };
    }
  }

  /** Find a detached worktree that would normally have this branch. */
  private async findWorktreeByBranch(
    mainRepoPath: string,
    branch: string,
  ): Promise<string | null> {
    const stdout = await git(mainRepoPath, "worktree", "list", "--porcelain");

    // Parse porcelain output - each worktree is separated by blank line
    // Format: worktree /path\nHEAD abc123\nbranch refs/heads/xxx (or "detached")
    const worktrees = stdout.split("\n\n").filter(Boolean);

    for (const wt of worktrees) {
      const lines = wt.split("\n");
      const pathLine = lines.find((l) => l.startsWith("worktree "));
      const detachedLine = lines.find((l) => l === "detached");

      if (pathLine && detachedLine) {
        const wtPath = pathLine.replace("worktree ", "");
        // Skip main repo itself
        if (wtPath === mainRepoPath) continue;

        // Check if this worktree's directory name matches the branch
        // (our convention: worktree path ends with branch name)
        if (
          wtPath.endsWith(branch) ||
          wtPath.includes(branch.replace("/", "-"))
        ) {
          return wtPath;
        }
      }
    }

    return null;
  }

  async enableFocus(
    workspaceId: string,
    mainRepoPath: string,
    worktreePath: string,
    branch: string,
  ): Promise<FocusResult> {
    log.info(`Enabling focus for workspace ${workspaceId}, branch ${branch}`);

    if (this.state.enabled) {
      if (this.state.workspaceId === workspaceId) {
        return { success: true };
      }
      log.info(
        `Swapping focus from ${this.state.workspaceId} to ${workspaceId}`,
      );
      const disableResult = await this.disableFocus(
        this.state.mainRepoPath,
        this.state.worktreePath,
        this.state.branch,
      );
      if (!disableResult.success) {
        return {
          success: false,
          error: `Failed to swap focus: ${disableResult.error}`,
        };
      }
    }

    const rebaseCheck = await this.checkRebaseOrMergeInProgress(mainRepoPath);
    if (rebaseCheck) {
      return { success: false, error: rebaseCheck };
    }

    const originalBranch = await this.getCurrentBranch(mainRepoPath);
    if (!originalBranch) {
      return { success: false, error: "Could not determine current branch" };
    }

    if (originalBranch === branch) {
      log.warn(`Cannot enable focus: main already on target branch ${branch}`);
      return {
        success: false,
        error: "Main repo is already on the target branch",
      };
    }

    const saga = new EnableFocusSaga(
      { git: this, syncService: this.syncService },
      this.createSagaLogger(),
    );

    const result = await saga.run({
      mainRepoPath,
      worktreePath,
      branch,
      originalBranch,
    });

    if (!result.success) {
      return { success: false, error: result.error };
    }

    this.state = {
      enabled: true,
      workspaceId,
      branch,
      mainRepoPath,
      worktreePath,
      originalBranch,
      mainStashRef: result.data.mainStashRef,
    };

    await this.writeFocusRef(mainRepoPath, {
      originalBranch,
      mainStashRef: result.data.mainStashRef,
    });

    log.info(`Focus enabled: main repo now on branch ${branch}`);

    return { success: true, stashed: !!result.data.mainStashRef };
  }

  async disableFocus(
    mainRepoPath: string,
    worktreePath: string,
    branch: string,
  ): Promise<FocusResult> {
    // Try to get originalBranch from ref, fallback to default branch
    const refData = await this.readFocusRef(mainRepoPath);
    let originalBranch = refData?.originalBranch ?? null;
    const mainStashRef = refData?.mainStashRef ?? null;

    // Validate or fallback
    if (!originalBranch || originalBranch === branch) {
      if (originalBranch === branch) {
        log.warn(
          `Corrupted state: originalBranch === branch (${branch}), falling back to default branch`,
        );
      } else {
        log.warn("No focus ref found, falling back to default branch");
      }

      const defaultBranch = await this.getDefaultBranch(mainRepoPath);
      if (!defaultBranch) {
        return {
          success: false,
          error: "Could not determine original branch to return to",
        };
      }
      originalBranch = defaultBranch;
    }

    log.info(`Disabling focus, returning to branch ${originalBranch}`);

    const saga = new DisableFocusSaga(
      { git: this, syncService: this.syncService },
      this.createSagaLogger(),
    );

    const result = await saga.run({
      mainRepoPath,
      worktreePath,
      branch,
      originalBranch,
      mainStashRef,
    });

    if (!result.success) {
      return { success: false, error: result.error };
    }

    await this.clearState(mainRepoPath);
    log.info("Focus disabled");

    if (result.data.stashPopWarning) {
      return {
        success: true,
        error: result.data.stashPopWarning,
        returnedToBranch: originalBranch,
      };
    }

    return { success: true, returnedToBranch: originalBranch };
  }

  private async clearState(mainRepoPath: string): Promise<void> {
    this.state = DISABLED_STATE;
    await this.deleteFocusRef(mainRepoPath);
  }

  async cleanWorkingTree(repoPath: string): Promise<void> {
    await git(repoPath, "reset");
    await git(repoPath, "restore", ".");
    await git(repoPath, "clean", "-fd");
  }

  private createSagaLogger(): SagaLogger {
    return {
      info: (msg, data) => log.info(msg, data),
      debug: (msg, data) => log.debug(msg, data),
      error: (msg, data) => log.error(msg, data),
      warn: (msg, data) => log.warn(msg, data),
    };
  }

  async detachWorktree(worktreePath: string): Promise<GitOperationResult> {
    return gitOp("Failed to detach worktree", async () => {
      await git(worktreePath, "checkout", "--detach");
      log.info(`Detached worktree at ${worktreePath}`);
      return { success: true };
    });
  }

  async reattachWorktree(
    worktreePath: string,
    branchName: string,
  ): Promise<GitOperationResult> {
    return gitOp("Failed to reattach worktree", async () => {
      // -B forces branch to point to current HEAD, recovering commits made while detached
      await git(worktreePath, "checkout", "-B", branchName);
      log.info(
        `Reattached worktree at ${worktreePath} to branch ${branchName}`,
      );
      return { success: true };
    });
  }

  private async checkRebaseOrMergeInProgress(
    repoPath: string,
  ): Promise<string | null> {
    const checks = [
      { gitPath: "rebase-merge", error: "rebase in progress" },
      { gitPath: "rebase-apply", error: "rebase in progress" },
      { gitPath: "MERGE_HEAD", error: "merge in progress" },
    ];

    for (const { gitPath, error } of checks) {
      const path = await git(repoPath, "rev-parse", "--git-path", gitPath);
      if (await pathExists(path)) {
        return `Cannot enable focus: ${error}. Complete or abort first.`;
      }
    }

    return null;
  }

  private async getCurrentBranch(repoPath: string): Promise<string | null> {
    const branch = await git(repoPath, "branch", "--show-current");
    if (!branch) {
      log.warn("getCurrentBranch returned empty (detached HEAD?)");
      return null;
    }
    return branch;
  }

  private async getDefaultBranch(repoPath: string): Promise<string | null> {
    try {
      // Try to get the default branch from origin
      const ref = await git(
        repoPath,
        "symbolic-ref",
        "refs/remotes/origin/HEAD",
      );
      // Returns something like "refs/remotes/origin/main"
      return ref.replace("refs/remotes/origin/", "");
    } catch {
      // Fallback: check if main or master exists
      try {
        await git(repoPath, "rev-parse", "--verify", "main");
        return "main";
      } catch {
        try {
          await git(repoPath, "rev-parse", "--verify", "master");
          return "master";
        } catch {
          return null;
        }
      }
    }
  }

  async isDirty(repoPath: string): Promise<boolean> {
    const stdout = await git(repoPath, "status", "--porcelain");
    return stdout.length > 0;
  }

  async stash(repoPath: string, message: string): Promise<StashResult> {
    return gitOp("Failed to stash", async () => {
      const beforeList = await git(repoPath, "stash", "list");
      const beforeCount = beforeList.split("\n").filter(Boolean).length;

      // Stage everything first to avoid "not uptodate" errors when file has both staged and unstaged changes
      await git(repoPath, "add", "-A");
      await git(
        repoPath,
        "stash",
        "push",
        "--include-untracked",
        "-m",
        message,
      );

      const afterList = await git(repoPath, "stash", "list");
      const afterCount = afterList.split("\n").filter(Boolean).length;

      if (afterCount > beforeCount) {
        return { success: true, stashRef: "stash@{0}" };
      }
      return { success: true };
    });
  }

  async stashPop(repoPath: string): Promise<GitOperationResult> {
    return gitOp("Failed to pop stash", async () => {
      await git(repoPath, "stash", "pop");
      return { success: true };
    });
  }

  async checkout(
    repoPath: string,
    branch: string,
  ): Promise<GitOperationResult> {
    return gitOp(`Failed to checkout ${branch}`, async () => {
      await git(repoPath, "checkout", branch);
      return { success: true };
    });
  }

  private async readFocusRef(repoPath: string): Promise<FocusRefData | null> {
    try {
      const stdout = await git(repoPath, "cat-file", "-p", this.FOCUS_REF);
      const parsed = JSON.parse(stdout);
      const result = focusRefDataSchema.safeParse(parsed);
      if (!result.success) {
        log.warn("Invalid focus ref data, clearing:", result.error.message);
        await this.deleteFocusRef(repoPath);
        return null;
      }
      return result.data;
    } catch (error) {
      const stderr = (error as { stderr?: string }).stderr ?? "";
      if (stderr.includes("Not a valid object name")) {
        return null;
      }
      throw error;
    }
  }

  private async writeFocusRef(
    repoPath: string,
    data: FocusRefData,
  ): Promise<void> {
    const json = JSON.stringify(data);
    const escaped = json.replace(/'/g, "'\\''");

    const { stdout: objectId } = await execAsync(
      `echo '${escaped}' | git hash-object -w --stdin`,
      { cwd: repoPath },
    );

    await git(repoPath, "update-ref", this.FOCUS_REF, objectId.trim());
  }

  private async deleteFocusRef(repoPath: string): Promise<void> {
    try {
      await git(repoPath, "update-ref", "-d", this.FOCUS_REF);
    } catch (error) {
      const stderr = (error as { stderr?: string }).stderr ?? "";
      if (stderr.includes("does not exist")) {
        log.debug("Focus ref does not exist, nothing to delete");
        return;
      }
      throw error;
    }
  }
}
