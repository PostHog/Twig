import { trpcReact } from "@renderer/trpc";
import { useState } from "react";

interface ConflictInfo {
  file: string;
  workspaces: string[];
}

/**
 * Parse conflict info from error message.
 * Error format: "Cannot add: file conflicts between workspaces:\n  file.ts (workspace-a, workspace-b)"
 */
function parseConflictError(errorMessage: string): ConflictInfo[] | null {
  if (!errorMessage.includes("file conflicts between workspaces")) {
    return null;
  }

  const conflicts: ConflictInfo[] = [];
  const lines = errorMessage.split("\n").slice(1); // Skip first line

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    // Parse "file.ts (workspace-a, workspace-b)"
    const match = trimmed.match(/^(.+?)\s+\((.+)\)$/);
    if (match) {
      const file = match[1];
      const workspaces = match[2].split(",").map((w) => w.trim());
      conflicts.push({ file, workspaces });
    }
  }

  return conflicts.length > 0 ? conflicts : null;
}

/**
 * Hook to manage focus state for workspaces.
 * Uses the arr.focusStatus query and arr.focusAdd/focusRemove mutations.
 * Operations are optimistic - UI updates immediately, rolls back on error.
 * @param repoPath - The repository path
 * @param singleSelect - If true, use focusOnly instead of focusAdd (git mode)
 */
export function useFocus(repoPath: string | undefined, singleSelect = false) {
  const utils = trpcReact.useUtils();
  const [pendingConflicts, setPendingConflicts] = useState<
    ConflictInfo[] | null
  >(null);

  const queryKey = { cwd: repoPath ?? "" };

  const { data: focusStatus, isLoading } = trpcReact.arr.focusStatus.useQuery(
    queryKey,
    {
      enabled: !!repoPath,
      staleTime: 0,
      gcTime: 0,
    },
  );

  const addMutation = trpcReact.arr.focusAdd.useMutation({
    onMutate: async ({ workspaces }) => {
      // Cancel outgoing refetches
      await utils.arr.focusStatus.cancel(queryKey);

      // Snapshot previous value
      const previous = utils.arr.focusStatus.getData(queryKey);

      // Optimistically update
      if (previous) {
        utils.arr.focusStatus.setData(queryKey, {
          ...previous,
          workspaces: [...new Set([...previous.workspaces, ...workspaces])],
        });
      }

      return { previous };
    },
    onError: (error, _variables, context) => {
      // Rollback on error
      if (context?.previous) {
        utils.arr.focusStatus.setData(queryKey, context.previous);
      }

      // Check for conflict error
      const conflicts = parseConflictError(error.message);
      if (conflicts) {
        setPendingConflicts(conflicts);
      }
    },
    onSettled: () => {
      // Refetch to ensure consistency
      utils.arr.focusStatus.invalidate(queryKey);
    },
  });

  const removeMutation = trpcReact.arr.focusRemove.useMutation({
    onMutate: async ({ workspaces }) => {
      // Cancel outgoing refetches
      await utils.arr.focusStatus.cancel(queryKey);

      // Snapshot previous value
      const previous = utils.arr.focusStatus.getData(queryKey);

      // Optimistically update
      if (previous) {
        const toRemove = new Set(workspaces);
        utils.arr.focusStatus.setData(queryKey, {
          ...previous,
          workspaces: previous.workspaces.filter((ws) => !toRemove.has(ws)),
        });
      }

      return { previous };
    },
    onError: (_error, _variables, context) => {
      // Rollback on error
      if (context?.previous) {
        utils.arr.focusStatus.setData(queryKey, context.previous);
      }
    },
    onSettled: () => {
      // Refetch to ensure consistency
      utils.arr.focusStatus.invalidate(queryKey);
    },
  });

  // For single-select mode (git): focus only this workspace
  const onlyMutation = trpcReact.arr.focusOnly.useMutation({
    onMutate: async ({ name }) => {
      await utils.arr.focusStatus.cancel(queryKey);
      const previous = utils.arr.focusStatus.getData(queryKey);

      if (previous) {
        utils.arr.focusStatus.setData(queryKey, {
          ...previous,
          workspaces: [name],
        });
      }

      return { previous };
    },
    onError: (error, _variables, context) => {
      if (context?.previous) {
        utils.arr.focusStatus.setData(queryKey, context.previous);
      }
      const conflicts = parseConflictError(error.message);
      if (conflicts) {
        setPendingConflicts(conflicts);
      }
    },
    onSettled: () => {
      utils.arr.focusStatus.invalidate(queryKey);
    },
  });

  const isWorkspaceFocused = (workspaceName: string): boolean => {
    if (!focusStatus) return false;
    return focusStatus.workspaces.includes(workspaceName);
  };

  const toggleFocus = (workspaceName: string) => {
    if (!repoPath) return;

    if (singleSelect) {
      // Git mode: select only this one
      onlyMutation.mutate({
        name: workspaceName,
        cwd: repoPath,
      });
    } else {
      // Workspace mode: toggle add/remove
      const isFocused = isWorkspaceFocused(workspaceName);
      if (isFocused) {
        removeMutation.mutate({
          workspaces: [workspaceName],
          cwd: repoPath,
        });
      } else {
        addMutation.mutate({
          workspaces: [workspaceName],
          cwd: repoPath,
        });
      }
    }
  };

  const clearPendingConflicts = () => {
    setPendingConflicts(null);
  };

  return {
    focusStatus,
    isLoading,
    isWorkspaceFocused,
    toggleFocus,
    isMutating:
      addMutation.isPending ||
      removeMutation.isPending ||
      onlyMutation.isPending,
    pendingConflicts,
    clearPendingConflicts,
  };
}
