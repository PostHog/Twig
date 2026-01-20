import { trpcVanilla } from "@renderer/trpc";
import { useFocusStore } from "@stores/focusStore";
import { useQuery } from "@tanstack/react-query";

/**
 * Returns the effective worktree path for diff stats.
 * For worktree-mode tasks, returns the worktree path.
 * For local-mode tasks:
 *   - If local is backgrounded (another worktree is focused), returns ~/.twig/{repo}/local
 *   - Otherwise returns the main repo path (folderPath)
 */
export function useEffectiveWorktreePath(
  worktreePath: string | null | undefined,
  folderPath: string | null | undefined,
  workspaceMode: "local" | "worktree" | "cloud" | undefined,
): string | undefined {
  const focusSession = useFocusStore((s) => s.session);

  // Only treat as local mode if explicitly set to "local", not when undefined
  // (undefined means no workspace exists yet, so we can't determine mode)
  const isLocalMode = workspaceMode === "local";

  // Check if a worktree is focused for this repo (meaning local is backgrounded)
  const isLocalBackgrounded =
    isLocalMode && !!focusSession && focusSession.mainRepoPath === folderPath;

  // Get worktree base location from main process (cached indefinitely)
  const { data: worktreeBase } = useQuery({
    queryKey: ["worktree-location"],
    queryFn: () => trpcVanilla.os.getWorktreeLocation.query(),
    staleTime: Number.POSITIVE_INFINITY,
  });

  // For worktree-mode tasks, always use the worktree path
  if (worktreePath) {
    return worktreePath;
  }

  // For local tasks that are backgrounded, use the local worktree path
  if (isLocalBackgrounded && worktreeBase && folderPath) {
    const repoName = folderPath.split("/").pop();
    if (repoName) {
      return `${worktreeBase}/${repoName}/local`;
    }
  }

  return folderPath ?? undefined;
}
