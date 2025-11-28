import type { WorktreeInfo } from "@posthog/agent";
import { WorktreeManager } from "@posthog/agent";
import { createIpcHandler } from "../lib/ipcHandler";
import { getWorktreeLocation } from "./settingsStore";

const handle = createIpcHandler("worktree");

function createWorktreeManager(mainRepoPath: string): WorktreeManager {
  const worktreeBasePath = getWorktreeLocation();
  return new WorktreeManager({ mainRepoPath, worktreeBasePath });
}

export function registerWorktreeIpc(): void {
  handle<[string], WorktreeInfo>(
    "worktree-create",
    async (_event, mainRepoPath) => {
      const manager = createWorktreeManager(mainRepoPath);
      return manager.createWorktree();
    },
  );

  handle<[string, string], void>(
    "worktree-delete",
    async (_event, mainRepoPath, worktreePath) => {
      const manager = createWorktreeManager(mainRepoPath);
      await manager.deleteWorktree(worktreePath);
    },
  );

  handle<[string, string], WorktreeInfo | null>(
    "worktree-get-info",
    async (_event, mainRepoPath, worktreePath) => {
      const manager = createWorktreeManager(mainRepoPath);
      return manager.getWorktreeInfo(worktreePath);
    },
    { rethrow: false, fallback: null },
  );

  handle<[string, string], boolean>(
    "worktree-exists",
    async (_event, mainRepoPath, name) => {
      const manager = createWorktreeManager(mainRepoPath);
      return manager.worktreeExists(name);
    },
    { rethrow: false, fallback: false },
  );

  handle<[string], WorktreeInfo[]>(
    "worktree-list",
    async (_event, mainRepoPath) => {
      const manager = createWorktreeManager(mainRepoPath);
      return manager.listWorktrees();
    },
    { rethrow: false, fallback: [] },
  );

  handle<[string, string], boolean>(
    "worktree-is-worktree",
    async (_event, mainRepoPath, repoPath) => {
      const manager = createWorktreeManager(mainRepoPath);
      return manager.isWorktree(repoPath);
    },
    { rethrow: false, fallback: false },
  );

  handle<[string, string], string | null>(
    "worktree-get-main-repo",
    async (_event, mainRepoPath, worktreePath) => {
      const manager = createWorktreeManager(mainRepoPath);
      return manager.getMainRepoPathFromWorktree(worktreePath);
    },
    { rethrow: false, fallback: null },
  );
}
