import { execFile } from "node:child_process";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { promisify } from "node:util";
import * as watcher from "@parcel/watcher";
import { injectable } from "inversify";
import { logger } from "../../lib/logger";
import { TypedEventEmitter } from "../../lib/typed-event-emitter";
import { type FocusSession, focusStore } from "../../utils/store.js";
import { getWorktreeLocation } from "../settingsStore";
import type { FocusResult, StashResult } from "./schemas.js";

const execFileAsync = promisify(execFile);

const log = logger.scope("focus");

export const FocusServiceEvent = {
  BranchRenamed: "branchRenamed",
  ForeignBranchCheckout: "foreignBranchCheckout",
} as const;

export interface FocusServiceEvents {
  [FocusServiceEvent.BranchRenamed]: {
    mainRepoPath: string;
    worktreePath: string;
    oldBranch: string;
    newBranch: string;
  };
  [FocusServiceEvent.ForeignBranchCheckout]: {
    mainRepoPath: string;
    worktreePath: string;
    focusedBranch: string;
    foreignBranch: string;
  };
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

let gitMutex: Promise<void> = Promise.resolve();

export async function withGitLock<T>(fn: () => Promise<T>): Promise<T> {
  const prev = gitMutex;
  let resolve: () => void = () => {};
  gitMutex = new Promise((r) => {
    resolve = r;
  });

  try {
    await prev;
    return await fn();
  } finally {
    resolve();
  }
}

export async function git(cwd: string, ...args: string[]): Promise<string> {
  return withGitLock(async () => {
    const { stdout } = await execFileAsync("git", args, { cwd });
    return stdout.trim();
  });
}

async function gitOp<T extends FocusResult>(
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

@injectable()
export class FocusService extends TypedEventEmitter<FocusServiceEvents> {
  private mainRepoWatcher: watcher.AsyncSubscription | null = null;
  private watchedMainRepo: string | null = null;

  async startWatchingMainRepo(mainRepoPath: string): Promise<void> {
    if (this.watchedMainRepo === mainRepoPath && this.mainRepoWatcher) {
      return;
    }

    await this.stopWatchingMainRepo();

    const gitDir = path.join(mainRepoPath, ".git");
    log.info(`Starting main repo watcher: ${gitDir}`);

    this.watchedMainRepo = mainRepoPath;
    this.mainRepoWatcher = await watcher.subscribe(gitDir, (err, events) => {
      if (err) {
        log.error("Main repo watcher error:", err);
        return;
      }

      const isRelevant = events.some(
        (e) => e.path.endsWith("/HEAD") || e.path.includes("/refs/heads/"),
      );

      if (isRelevant) {
        log.info("Main repo git state changed, checking for branch rename");
        this.checkForBranchRename(mainRepoPath);
      }
    });
  }

  async stopWatchingMainRepo(): Promise<void> {
    if (this.mainRepoWatcher) {
      await this.mainRepoWatcher.unsubscribe();
      this.mainRepoWatcher = null;
      this.watchedMainRepo = null;
      log.info("Stopped main repo watcher");
    }
  }

  private async checkForBranchRename(mainRepoPath: string): Promise<void> {
    const session = this.getSession(mainRepoPath);
    if (!session) return;

    const currentBranch = await this.getCurrentBranch(mainRepoPath);
    if (!currentBranch) return;

    if (currentBranch === session.branch) return;

    const oldBranchExists = await this.branchExists(
      mainRepoPath,
      session.branch,
    );

    if (!oldBranchExists) {
      log.info(`Branch renamed: ${session.branch} -> ${currentBranch}`);
      const oldBranch = session.branch;
      session.branch = currentBranch;
      session.commitSha = await this.getCommitSha(mainRepoPath);
      this.saveSession(session);

      this.emit(FocusServiceEvent.BranchRenamed, {
        mainRepoPath,
        worktreePath: session.worktreePath,
        oldBranch,
        newBranch: currentBranch,
      });
    } else {
      log.warn(
        `Foreign branch checkout detected: ${session.branch} -> ${currentBranch} (old branch still exists)`,
      );
      this.emit(FocusServiceEvent.ForeignBranchCheckout, {
        mainRepoPath,
        worktreePath: session.worktreePath,
        focusedBranch: session.branch,
        foreignBranch: currentBranch,
      });
    }
  }

  private async branchExists(
    repoPath: string,
    branch: string,
  ): Promise<boolean> {
    try {
      await git(repoPath, "rev-parse", "--verify", `refs/heads/${branch}`);
      return true;
    } catch {
      return false;
    }
  }

  async getCommitSha(repoPath: string): Promise<string> {
    return git(repoPath, "rev-parse", "HEAD");
  }

  /**
   * Convert absolute worktree path to relative path for storage.
   * Format: {repoName}/{worktreeName}
   */
  toRelativeWorktreePath(absolutePath: string, mainRepoPath: string): string {
    const repoName = path.basename(mainRepoPath);
    const worktreeName = path.basename(absolutePath);
    return `${repoName}/${worktreeName}`;
  }

  /**
   * Convert relative worktree path back to absolute path.
   */
  toAbsoluteWorktreePath(relativePath: string): string {
    return path.join(getWorktreeLocation(), relativePath);
  }

  /**
   * Check if a worktree exists at the given relative path.
   */
  async worktreeExistsAtPath(relativePath: string): Promise<boolean> {
    const absolutePath = this.toAbsoluteWorktreePath(relativePath);
    try {
      await fs.access(absolutePath);
      return true;
    } catch {
      return false;
    }
  }

  async findWorktreeByBranch(
    mainRepoPath: string,
    branch: string,
  ): Promise<string | null> {
    const worktreesDir = path.join(mainRepoPath, ".git", "worktrees");
    const branchSuffix = branch.split("/").pop() ?? branch;

    let entries: string[];
    try {
      entries = await fs.readdir(worktreesDir);
    } catch {
      return null;
    }

    for (const name of entries) {
      if (name !== branchSuffix) continue;

      const wtDir = path.join(worktreesDir, name);
      const gitdirPath = path.join(wtDir, "gitdir");
      const headPath = path.join(wtDir, "HEAD");

      try {
        const [gitdirContent, headContent] = await Promise.all([
          fs.readFile(gitdirPath, "utf-8"),
          fs.readFile(headPath, "utf-8"),
        ]);

        const isDetached = !headContent.trim().startsWith("ref:");
        if (!isDetached) continue;

        const worktreePath = path.dirname(gitdirContent.trim());
        return worktreePath;
      } catch {}
    }

    return null;
  }

  async cleanWorkingTree(repoPath: string): Promise<void> {
    await this.cleanStaleLockFile(repoPath);
    await git(repoPath, "reset");
    await git(repoPath, "restore", ".");
    await git(repoPath, "clean", "-fd");
    await this.forceRemoveLockFile(repoPath);
  }

  private async cleanStaleLockFile(repoPath: string): Promise<void> {
    const lockPath = path.join(repoPath, ".git", "index.lock");
    try {
      const stat = await fs.stat(lockPath);
      const ageMs = Date.now() - stat.mtimeMs;
      if (ageMs > 2000) {
        await fs.rm(lockPath);
        log.info(
          `Removed stale index.lock (age: ${Math.round(ageMs / 1000)}s)`,
        );
      }
    } catch {}
  }

  private async forceRemoveLockFile(repoPath: string): Promise<void> {
    const lockPath = path.join(repoPath, ".git", "index.lock");
    try {
      await fs.rm(lockPath);
      log.info("Removed index.lock after cleaning working tree");
    } catch {}
  }

  async detachWorktree(worktreePath: string): Promise<FocusResult> {
    return gitOp("Failed to detach worktree", async () => {
      await git(worktreePath, "checkout", "--detach");
      log.info(`Detached worktree at ${worktreePath}`);
      return { success: true };
    });
  }

  async reattachWorktree(
    worktreePath: string,
    branchName: string,
  ): Promise<FocusResult> {
    return gitOp("Failed to reattach worktree", async () => {
      await git(worktreePath, "checkout", "-B", branchName);
      log.info(
        `Reattached worktree at ${worktreePath} to branch ${branchName}`,
      );
      return { success: true };
    });
  }

  async getCurrentBranch(repoPath: string): Promise<string | null> {
    const branch = await git(repoPath, "branch", "--show-current");
    if (!branch) {
      log.warn("getCurrentBranch returned empty (detached HEAD?)");
      return null;
    }
    return branch;
  }

  async isDirty(repoPath: string): Promise<boolean> {
    const stdout = await git(repoPath, "status", "--porcelain");
    return stdout.length > 0;
  }

  async stash(repoPath: string, message: string): Promise<StashResult> {
    return gitOp("Failed to stash", async () => {
      await this.cleanStaleLockFile(repoPath);
      const beforeList = await git(repoPath, "stash", "list");
      const beforeCount = beforeList.split("\n").filter(Boolean).length;

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
        // Get the SHA of the stash commit (survives other stashes being added)
        const stashSha = await git(repoPath, "rev-parse", "stash@{0}");
        return { success: true, stashRef: stashSha };
      }
      return { success: true };
    });
  }

  async stashApply(repoPath: string, stashRef: string): Promise<FocusResult> {
    return gitOp("Failed to apply stash", async () => {
      await this.cleanStaleLockFile(repoPath);
      await git(repoPath, "stash", "apply", stashRef);

      // Find the stash reference that matches this SHA
      // Format: "<sha> stash@{N}"
      const reflog = await git(
        repoPath,
        "reflog",
        "show",
        "--format=%H %gd",
        "refs/stash",
      );
      const match = reflog
        .split("\n")
        .find((line) => line.startsWith(stashRef));

      if (match) {
        const stashIndex = match.split(" ")[1]; // e.g., "stash@{0}"
        await git(repoPath, "stash", "drop", stashIndex);
      } else {
        log.warn(`Stash SHA ${stashRef} not found in reflog, skipping drop`);
      }

      return { success: true };
    });
  }

  async stashPop(repoPath: string): Promise<FocusResult> {
    return gitOp("Failed to pop stash", async () => {
      await git(repoPath, "stash", "pop");
      return { success: true };
    });
  }

  async checkout(repoPath: string, branch: string): Promise<FocusResult> {
    return gitOp(`Failed to checkout ${branch}`, async () => {
      await this.cleanStaleLockFile(repoPath);
      await git(repoPath, "checkout", branch);
      return { success: true };
    });
  }

  getSession(mainRepoPath: string): FocusSession | null {
    const sessions = focusStore.get("sessions", {});
    return sessions[mainRepoPath] ?? null;
  }

  saveSession(session: FocusSession): void {
    const sessions = focusStore.get("sessions", {});
    sessions[session.mainRepoPath] = session;
    focusStore.set("sessions", sessions);
    log.info("Saved focus session", { mainRepoPath: session.mainRepoPath });
  }

  deleteSession(mainRepoPath: string): void {
    const sessions = focusStore.get("sessions", {});
    delete sessions[mainRepoPath];
    focusStore.set("sessions", sessions);
    log.info("Deleted focus session", { mainRepoPath });
  }

  isFocusActive(mainRepoPath: string): boolean {
    return this.getSession(mainRepoPath) !== null;
  }

  validateFocusOperation(
    currentBranch: string | null,
    targetBranch: string,
  ): string | null {
    if (!currentBranch) {
      return "Cannot focus: main repo is in detached HEAD state.";
    }
    if (currentBranch === targetBranch) {
      return `Cannot focus: already on branch "${targetBranch}".`;
    }
    return null;
  }
}
