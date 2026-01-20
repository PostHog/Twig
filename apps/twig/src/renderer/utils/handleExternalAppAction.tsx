import type { ExternalAppAction } from "@main/services/context-menu/schemas";
import { logger } from "@renderer/lib/logger";
import { trpcVanilla } from "@renderer/trpc/client";
import type { Workspace } from "@shared/types";
import { useExternalAppsStore } from "@stores/externalAppsStore";
import { useFocusStore } from "@stores/focusStore";
import { toast } from "@utils/toast";
import { showFocusSuccessToast } from "./focusToast";

const log = logger.scope("external-app-action");

interface WorkspaceContext {
  workspace: Workspace | null;
  mainRepoPath?: string;
}

/**
 * Ensures the workspace is focused before opening files.
 * If not focused, automatically focuses the workspace first.
 * Returns the effective path to use (main repo path if focused, original path otherwise).
 */
async function ensureWorkspaceFocused(
  filePath: string,
  workspaceContext?: WorkspaceContext,
): Promise<{ effectivePath: string; didFocus: boolean }> {
  if (!workspaceContext?.workspace) {
    return { effectivePath: filePath, didFocus: false };
  }

  const { workspace, mainRepoPath } = workspaceContext;

  // Only applies to worktree mode workspaces
  if (
    workspace.mode !== "worktree" ||
    !workspace.branchName ||
    !workspace.worktreePath
  ) {
    return { effectivePath: filePath, didFocus: false };
  }

  const focusStore = useFocusStore.getState();
  const isAlreadyFocused =
    focusStore.session?.worktreePath === workspace.worktreePath;

  if (isAlreadyFocused && mainRepoPath) {
    // Already focused - convert worktree path to main repo path
    const relativePath = filePath.replace(workspace.worktreePath, "");
    const effectivePath = `${mainRepoPath}${relativePath}`;
    return { effectivePath, didFocus: false };
  }

  if (!isAlreadyFocused && mainRepoPath) {
    // Need to focus first
    log.info("Auto-focusing workspace before opening file", {
      branch: workspace.branchName,
    });

    const result = await focusStore.enableFocus({
      mainRepoPath: workspace.folderPath,
      worktreePath: workspace.worktreePath,
      branch: workspace.branchName,
    });

    if (result.success) {
      showFocusSuccessToast(workspace.branchName, result);

      // Convert worktree path to main repo path
      const relativePath = filePath.replace(workspace.worktreePath, "");
      const effectivePath = `${mainRepoPath}${relativePath}`;
      return { effectivePath, didFocus: true };
    }

    // Focus failed - fall back to original path
    toast.error("Could not edit workspace", {
      description: result.error,
    });
    return { effectivePath: filePath, didFocus: false };
  }

  return { effectivePath: filePath, didFocus: false };
}

export async function handleExternalAppAction(
  action: ExternalAppAction,
  filePath: string,
  displayName: string,
  workspaceContext?: WorkspaceContext,
): Promise<void> {
  if (action.type === "open-in-app") {
    // Ensure workspace is focused before opening
    const { effectivePath } = await ensureWorkspaceFocused(
      filePath,
      workspaceContext,
    );

    log.info("Opening file in app", {
      appId: action.appId,
      filePath: effectivePath,
      displayName,
    });
    const openResult = await trpcVanilla.externalApps.openInApp.mutate({
      appId: action.appId,
      targetPath: effectivePath,
    });
    if (openResult.success) {
      await useExternalAppsStore.getState().setLastUsedApp(action.appId);

      const apps = await trpcVanilla.externalApps.getDetectedApps.query();
      const app = apps.find((a) => a.id === action.appId);
      toast.success(`Opening in ${app?.name || "external app"}`, {
        description: displayName,
      });
    } else {
      toast.error("Failed to open in external app", {
        description: openResult.error || "Unknown error",
      });
    }
  } else if (action.type === "copy-path") {
    await trpcVanilla.externalApps.copyPath.mutate({ targetPath: filePath });
    toast.success("Path copied to clipboard", {
      description: filePath,
    });
  }
}
