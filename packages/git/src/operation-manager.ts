import { createGitClient } from "./client.js";
import { removeLock, waitForUnlock } from "./lock-detector.js";
import { AsyncReaderWriterLock } from "./rw-lock.js";

interface RepoState {
  lock: AsyncReaderWriterLock;
  lastAccess: number;
}

export interface ExecuteOptions {
  signal?: AbortSignal;
  timeoutMs?: number;
  waitForExternalLock?: boolean;
}

class GitOperationManagerImpl {
  private repoStates = new Map<string, RepoState>();
  private cleanupInterval: ReturnType<typeof setInterval> | null = null;
  private static readonly CLEANUP_INTERVAL_MS = 60000;
  private static readonly IDLE_TIMEOUT_MS = 300000;

  constructor() {
    this.cleanupInterval = setInterval(
      () => this.cleanupIdleRepos(),
      GitOperationManagerImpl.CLEANUP_INTERVAL_MS,
    );
  }

  private getRepoState(repoPath: string): RepoState {
    let state = this.repoStates.get(repoPath);
    if (!state) {
      state = { lock: new AsyncReaderWriterLock(), lastAccess: Date.now() };
      this.repoStates.set(repoPath, state);
    }
    state.lastAccess = Date.now();
    return state;
  }

  private cleanupIdleRepos(): void {
    const now = Date.now();
    for (const [repoPath, state] of this.repoStates) {
      if (now - state.lastAccess > GitOperationManagerImpl.IDLE_TIMEOUT_MS) {
        this.repoStates.delete(repoPath);
      }
    }
  }

  async executeRead<T>(
    repoPath: string,
    operation: (git: ReturnType<typeof createGitClient>) => Promise<T>,
    options?: ExecuteOptions,
  ): Promise<T> {
    const state = this.getRepoState(repoPath);
    await state.lock.acquireRead();
    try {
      const git = createGitClient(repoPath, {
        abortSignal: options?.signal,
      }).env({ GIT_OPTIONAL_LOCKS: "0" });
      return await operation(git);
    } finally {
      state.lock.releaseRead();
    }
  }

  async executeWrite<T>(
    repoPath: string,
    operation: (git: ReturnType<typeof createGitClient>) => Promise<T>,
    options?: ExecuteOptions,
  ): Promise<T> {
    const state = this.getRepoState(repoPath);

    if (options?.waitForExternalLock !== false) {
      const unlocked = await waitForUnlock(
        repoPath,
        options?.timeoutMs ?? 10000,
      );
      if (!unlocked) {
        throw new Error(`Git repository is locked: ${repoPath}`);
      }
    }

    await state.lock.acquireWrite();
    try {
      const git = createGitClient(repoPath, { abortSignal: options?.signal });
      return await operation(git);
    } catch (error) {
      if (options?.signal?.aborted) {
        await removeLock(repoPath).catch(() => {});
      }
      throw error;
    } finally {
      state.lock.releaseWrite();
    }
  }

  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    this.repoStates.clear();
  }
}

let instance: GitOperationManagerImpl | null = null;

export function getGitOperationManager(): GitOperationManagerImpl {
  if (!instance) {
    instance = new GitOperationManagerImpl();
  }
  return instance;
}

export function resetGitOperationManager(): void {
  if (instance) {
    instance.destroy();
    instance = null;
  }
}

export type GitOperationManager = GitOperationManagerImpl;
