import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as watcher from "@parcel/watcher";
import {
  getHeadSha,
  branchExists as gitBranchExists,
  getCurrentBranch as gitGetCurrentBranch,
  hasChanges,
} from "@twig/git/queries";
import { SwitchBranchSaga } from "@twig/git/sagas/branch";
import { CleanWorkingTreeSaga } from "@twig/git/sagas/clean";
import { DetachHeadSaga, ReattachBranchSaga } from "@twig/git/sagas/head";
import {
  StashApplySaga,
  StashPopSaga,
  StashPushSaga,
} from "@twig/git/sagas/stash";
import { inject, injectable } from "inversify";
import { MAIN_TOKENS } from "../../di/tokens.js";
import { logger } from "../../lib/logger";
import { TypedEventEmitter } from "../../lib/typed-event-emitter";
import { type FocusSession, focusStore } from "../../utils/store.js";
import { getWorktreeLocation } from "../settingsStore";
import type { WatcherRegistryService } from "../watcher-registry/service.js";
import type { FocusResult, StashResult } from "./schemas.js";

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

@injectable()
export class FocusService extends TypedEventEmitter<FocusServiceEvents> {
  private watchedMainRepo: string | null = null;
  private mainRepoWatcherId: string | null = null;

  constructor(
    @inject(MAIN_TOKENS.WatcherRegistryService)
    private watcherRegistry: WatcherRegistryService,
  ) {
    super();
  }

  async startWatchingMainRepo(mainRepoPath: string): Promise<void> {
    if (this.watchedMainRepo === mainRepoPath && this.mainRepoWatcherId) {
      return;
    }

    await this.stopWatchingMainRepo();

    const gitDir = path.join(mainRepoPath, ".git");
    log.info(`Starting main repo watcher: ${gitDir}`);

    this.watchedMainRepo = mainRepoPath;
    this.mainRepoWatcherId = `focus:main-repo:${mainRepoPath}`;

    const subscription = await watcher.subscribe(gitDir, (err, events) => {
      if (this.watcherRegistry.isShutdown) {
        return;
      }

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

    this.watcherRegistry.register(this.mainRepoWatcherId, subscription);
  }

  async stopWatchingMainRepo(): Promise<void> {
    if (this.mainRepoWatcherId) {
      await this.watcherRegistry.unregister(this.mainRepoWatcherId);
      this.mainRepoWatcherId = null;
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
    return gitBranchExists(repoPath, branch);
  }

  async getCommitSha(repoPath: string): Promise<string> {
    return getHeadSha(repoPath);
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
    const saga = new CleanWorkingTreeSaga();
    const result = await saga.run({ baseDir: repoPath });
    if (!result.success) {
      throw new Error(`Failed to clean working tree: ${result.error}`);
    }
  }

  async detachWorktree(worktreePath: string): Promise<FocusResult> {
    const saga = new DetachHeadSaga();
    const result = await saga.run({ baseDir: worktreePath });
    if (!result.success) {
      log.error("Failed to detach worktree:", result.error);
      return {
        success: false,
        error: `Failed to detach worktree: ${result.error}`,
      };
    }
    log.info(`Detached worktree at ${worktreePath}`);
    return { success: true };
  }

  async reattachWorktree(
    worktreePath: string,
    branchName: string,
  ): Promise<FocusResult> {
    const saga = new ReattachBranchSaga();
    const result = await saga.run({ baseDir: worktreePath, branchName });
    if (!result.success) {
      log.error("Failed to reattach worktree:", result.error);
      return {
        success: false,
        error: `Failed to reattach worktree: ${result.error}`,
      };
    }
    log.info(`Reattached worktree at ${worktreePath} to branch ${branchName}`);
    return { success: true };
  }

  async getCurrentBranch(repoPath: string): Promise<string | null> {
    const branch = await gitGetCurrentBranch(repoPath);
    if (!branch) {
      log.warn("getCurrentBranch returned empty (detached HEAD?)");
      return null;
    }
    return branch;
  }

  async isDirty(repoPath: string): Promise<boolean> {
    return hasChanges(repoPath);
  }

  async stash(repoPath: string, message: string): Promise<StashResult> {
    const saga = new StashPushSaga();
    const result = await saga.run({ baseDir: repoPath, message });
    if (!result.success) {
      log.error("Failed to stash:", result.error);
      return { success: false, error: `Failed to stash: ${result.error}` };
    }
    if (result.data.stashSha) {
      return { success: true, stashRef: result.data.stashSha };
    }
    return { success: true };
  }

  async stashApply(repoPath: string, stashRef: string): Promise<FocusResult> {
    const saga = new StashApplySaga();
    const result = await saga.run({ baseDir: repoPath, stashSha: stashRef });
    if (!result.success) {
      log.error("Failed to apply stash:", result.error);
      return {
        success: false,
        error: `Failed to apply stash: ${result.error}`,
      };
    }
    if (!result.data.dropped) {
      log.warn(`Stash SHA ${stashRef} not found in reflog, skipping drop`);
    }
    return { success: true };
  }

  async stashPop(repoPath: string): Promise<FocusResult> {
    const saga = new StashPopSaga();
    const result = await saga.run({ baseDir: repoPath });
    if (!result.success) {
      log.error("Failed to pop stash:", result.error);
      return { success: false, error: `Failed to pop stash: ${result.error}` };
    }
    return { success: true };
  }

  async checkout(repoPath: string, branch: string): Promise<FocusResult> {
    const saga = new SwitchBranchSaga();
    const result = await saga.run({ baseDir: repoPath, branchName: branch });
    if (!result.success) {
      log.error(`Failed to checkout ${branch}:`, result.error);
      return {
        success: false,
        error: `Failed to checkout ${branch}: ${result.error}`,
      };
    }
    return { success: true };
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
