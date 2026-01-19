import { trpcReact } from "@renderer/trpc";

/**
 * Hook to manage jj/git mode for a repository.
 */
export function useJJMode(repoPath: string | undefined) {
  const utils = trpcReact.useUtils();

  const { data: modeInfo, isLoading } = trpcReact.arr.repoMode.useQuery(
    { cwd: repoPath ?? "" },
    { enabled: !!repoPath, staleTime: 5000, refetchInterval: 10000 },
  );

  const enterMutation = trpcReact.arr.enter.useMutation({
    onSuccess: () => {
      if (repoPath) {
        utils.arr.repoMode.invalidate({ cwd: repoPath });
        utils.arr.focusStatus.invalidate({ cwd: repoPath });
        utils.arr.workspaceStatus.invalidate({ cwd: repoPath });
      }
    },
  });

  const exitMutation = trpcReact.arr.exit.useMutation({
    onSuccess: () => {
      if (repoPath) {
        utils.arr.repoMode.invalidate({ cwd: repoPath });
        utils.arr.focusStatus.invalidate({ cwd: repoPath });
        utils.arr.workspaceStatus.invalidate({ cwd: repoPath });
      }
    },
  });

  const enter = async () => {
    if (!repoPath) return;
    return enterMutation.mutateAsync({ cwd: repoPath });
  };

  const exit = async () => {
    if (!repoPath) return;
    return exitMutation.mutateAsync({ cwd: repoPath });
  };

  return {
    mode: modeInfo?.mode ?? null,
    branch: modeInfo?.branch ?? null,
    isJJMode: modeInfo?.mode === "jj",
    isGitMode: modeInfo?.mode === "git",
    isLoading,
    enter,
    exit,
    isEntering: enterMutation.isPending,
    isExiting: exitMutation.isPending,
    enterError: enterMutation.error,
    exitError: exitMutation.error,
  };
}
