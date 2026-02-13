import { createGitClient, type GitClient } from "./client.js";
import { removeLock, waitForUnlock } from "./lock-detector.js";
import { AsyncReaderWriterLock } from "./rw-lock.js";

interface RepoState {
  lock: AsyncReaderWriterLock;
  client: GitClient;
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
      state = {
        lock: new AsyncReaderWriterLock(),
        client: createGitClient(repoPath),
        lastAccess: Date.now(),
      };
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
    operation: (git: GitClient) => Promise<T>,
    options?: ExecuteOptions,
  ): Promise<T> {
    const state = this.getRepoState(repoPath);

    if (options?.signal) {
      const scopedGit = createGitClient(repoPath, {
        abortSignal: options.signal,
      });
      return operation(
        scopedGit.env({ ...process.env, GIT_OPTIONAL_LOCKS: "0" }),
      );
    }

    const git = state.client.env({ ...process.env, GIT_OPTIONAL_LOCKS: "0" });
    return operation(git);
  }

  async executeWrite<T>(
    repoPath: string,
    operation: (git: GitClient) => Promise<T>,
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
      if (options?.signal) {
        const scopedGit = createGitClient(repoPath, {
          abortSignal: options.signal,
        });
        return await operation(scopedGit.env(process.env));
      }

      return await operation(state.client.env(process.env));
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
