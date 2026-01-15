import { trpcReact } from "@renderer/trpc";

/**
 * Hook to manage focus state for workspaces.
 * Uses the arr.focusStatus query and arr.focusAdd/focusRemove mutations.
 */
export function useFocus(repoPath: string | undefined) {
  const utils = trpcReact.useUtils();

  const { data: focusStatus, isLoading } = trpcReact.arr.focusStatus.useQuery(
    { cwd: repoPath ?? "" },
    {
      enabled: !!repoPath,
      staleTime: 2000,
      refetchInterval: 5000,
    },
  );

  const addMutation = trpcReact.arr.focusAdd.useMutation({
    onSuccess: () => {
      if (repoPath) {
        utils.arr.focusStatus.invalidate({ cwd: repoPath });
      }
    },
  });

  const removeMutation = trpcReact.arr.focusRemove.useMutation({
    onSuccess: () => {
      if (repoPath) {
        utils.arr.focusStatus.invalidate({ cwd: repoPath });
      }
    },
  });

  const isWorkspaceFocused = (workspaceName: string): boolean => {
    if (!focusStatus) return false;
    return focusStatus.workspaces.includes(workspaceName);
  };

  const toggleFocus = async (workspaceName: string) => {
    if (!repoPath) return;

    const isFocused = isWorkspaceFocused(workspaceName);
    if (isFocused) {
      await removeMutation.mutateAsync({
        workspaces: [workspaceName],
        cwd: repoPath,
      });
    } else {
      await addMutation.mutateAsync({
        workspaces: [workspaceName],
        cwd: repoPath,
      });
    }
  };

  return {
    focusStatus,
    isLoading,
    isWorkspaceFocused,
    toggleFocus,
    isMutating: addMutation.isPending || removeMutation.isPending,
  };
}
