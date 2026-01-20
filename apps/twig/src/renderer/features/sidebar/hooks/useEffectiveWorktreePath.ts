import { useFocusStore } from "@stores/focusStore";

/**
 * Returns the effective worktree path for diff stats.
 * For worktree-mode tasks, returns the worktree path.
 * For local-mode tasks, checks focusStore to see if local is focused.
 */
export function useEffectiveWorktreePath(
  worktreePath: string | null | undefined,
  folderPath: string | null | undefined,
  workspaceMode: "local" | "worktree" | "cloud" | undefined,
): string | undefined {
  const focusSession = useFocusStore((s) => s.session);

  if (worktreePath) {
    return worktreePath;
  }

  const isLocalMode = workspaceMode === "local" || !workspaceMode;
  if (
    isLocalMode &&
    focusSession?.mainRepoPath === folderPath &&
    focusSession?.localWorktreePath
  ) {
    return focusSession.localWorktreePath;
  }

  return folderPath ?? undefined;
}
