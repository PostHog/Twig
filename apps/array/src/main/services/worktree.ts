import type { WorktreeInfo } from "@posthog/agent";
import { WorktreeManager } from "@posthog/agent";
import { type IpcMainInvokeEvent, ipcMain } from "electron";

export function registerWorktreeIpc(): void {
  ipcMain.handle(
    "worktree-create",
    async (
      _event: IpcMainInvokeEvent,
      mainRepoPath: string,
    ): Promise<WorktreeInfo> => {
      try {
        const manager = new WorktreeManager({ mainRepoPath });
        return await manager.createWorktree();
      } catch (error) {
        console.error(`Failed to create worktree in ${mainRepoPath}:`, error);
        throw error;
      }
    },
  );

  ipcMain.handle(
    "worktree-delete",
    async (
      _event: IpcMainInvokeEvent,
      mainRepoPath: string,
      worktreePath: string,
    ): Promise<void> => {
      try {
        const manager = new WorktreeManager({ mainRepoPath });
        await manager.deleteWorktree(worktreePath);
      } catch (error) {
        console.error(`Failed to delete worktree ${worktreePath}:`, error);
        throw error;
      }
    },
  );

  ipcMain.handle(
    "worktree-get-info",
    async (
      _event: IpcMainInvokeEvent,
      mainRepoPath: string,
      worktreePath: string,
    ): Promise<WorktreeInfo | null> => {
      try {
        const manager = new WorktreeManager({ mainRepoPath });
        return await manager.getWorktreeInfo(worktreePath);
      } catch (error) {
        console.error(
          `Failed to get worktree info for ${worktreePath}:`,
          error,
        );
        return null;
      }
    },
  );

  ipcMain.handle(
    "worktree-exists",
    async (
      _event: IpcMainInvokeEvent,
      mainRepoPath: string,
      name: string,
    ): Promise<boolean> => {
      try {
        const manager = new WorktreeManager({ mainRepoPath });
        return await manager.worktreeExists(name);
      } catch (error) {
        console.error(`Failed to check worktree exists ${name}:`, error);
        return false;
      }
    },
  );

  ipcMain.handle(
    "worktree-list",
    async (
      _event: IpcMainInvokeEvent,
      mainRepoPath: string,
    ): Promise<WorktreeInfo[]> => {
      try {
        const manager = new WorktreeManager({ mainRepoPath });
        return await manager.listWorktrees();
      } catch (error) {
        console.error(`Failed to list worktrees in ${mainRepoPath}:`, error);
        return [];
      }
    },
  );

  ipcMain.handle(
    "worktree-is-worktree",
    async (
      _event: IpcMainInvokeEvent,
      mainRepoPath: string,
      repoPath: string,
    ): Promise<boolean> => {
      try {
        const manager = new WorktreeManager({ mainRepoPath });
        return await manager.isWorktree(repoPath);
      } catch (error) {
        console.error(`Failed to check if ${repoPath} is a worktree:`, error);
        return false;
      }
    },
  );

  ipcMain.handle(
    "worktree-get-main-repo",
    async (
      _event: IpcMainInvokeEvent,
      mainRepoPath: string,
      worktreePath: string,
    ): Promise<string | null> => {
      try {
        const manager = new WorktreeManager({ mainRepoPath });
        return await manager.getMainRepoPathFromWorktree(worktreePath);
      } catch (error) {
        console.error(
          `Failed to get main repo path from ${worktreePath}:`,
          error,
        );
        return null;
      }
    },
  );
}
