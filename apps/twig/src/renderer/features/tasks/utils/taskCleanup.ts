import { getSessionActions } from "@features/sessions/stores/sessionStore";
import { useWorkspaceStore } from "@features/workspace/stores/workspaceStore";
import { logger } from "@renderer/lib/logger";

const log = logger.scope("task-cleanup");

/**
 * Unified cleanup for task-related resources.
 *
 * Handles cleanup of:
 * - Agent sessions (disconnects and removes from store)
 * - Workspaces (deletes jj worktree and cleans up terminal sessions)
 *
 * This ensures bidirectional cleanup: deleting a workspace also cleans up
 * the session, and disconnecting a session can optionally clean up the workspace.
 */
export async function cleanupTaskResources(
  taskId: string,
  options: {
    deleteWorkspace?: boolean;
    disconnectSession?: boolean;
  } = { deleteWorkspace: true, disconnectSession: true },
): Promise<void> {
  const { deleteWorkspace = true, disconnectSession = true } = options;

  log.info("Cleaning up task resources", {
    taskId,
    deleteWorkspace,
    disconnectSession,
  });

  // Disconnect session first (faster, doesn't depend on workspace)
  if (disconnectSession) {
    try {
      await getSessionActions().disconnectFromTask(taskId);
      log.info("Session disconnected", { taskId });
    } catch (error) {
      log.error("Failed to disconnect session:", { taskId, error });
      // Continue with workspace cleanup even if session cleanup fails
    }
  }

  // Delete workspace
  if (deleteWorkspace) {
    const workspaceStore = useWorkspaceStore.getState();
    const workspace = workspaceStore.workspaces[taskId];

    if (workspace) {
      try {
        await workspaceStore.deleteWorkspace(taskId);
        log.info("Workspace deleted", { taskId });
      } catch (error) {
        log.error("Failed to delete workspace:", { taskId, error });
      }
    }
  }
}
