import { trpcReact } from "@renderer/trpc";
import { create } from "zustand";

interface FocusState {
  isFocused: boolean;
  workspaces: string[];
  conflicts: Array<{ file: string; workspaces: string[] }>;
}

interface DashboardState {
  // Per-repo focus state (cached from queries)
  focusStatus: Record<string, FocusState>;

  // Drag-drop UI state
  draggingFiles: string[];
  dropTargetWorkspace: string | null;

  // Modal state
  conflictModalOpen: boolean;

  // Actions
  setFocusStatus: (repoPath: string, status: FocusState) => void;
  setDraggingFiles: (files: string[]) => void;
  setDropTargetWorkspace: (workspace: string | null) => void;
  setConflictModalOpen: (open: boolean) => void;
  clearDragState: () => void;
}

export const useDashboardStore = create<DashboardState>((set) => ({
  focusStatus: {},
  draggingFiles: [],
  dropTargetWorkspace: null,
  conflictModalOpen: false,

  setFocusStatus: (repoPath, status) =>
    set((state) => ({
      focusStatus: { ...state.focusStatus, [repoPath]: status },
    })),

  setDraggingFiles: (files) => set({ draggingFiles: files }),

  setDropTargetWorkspace: (workspace) =>
    set({ dropTargetWorkspace: workspace }),

  setConflictModalOpen: (open) => set({ conflictModalOpen: open }),

  clearDragState: () =>
    set({
      draggingFiles: [],
      dropTargetWorkspace: null,
    }),
}));

/**
 * Hook to manage focus state with tRPC mutations.
 * Wraps the store actions with API calls.
 */
export function useDashboardActions(repoPath: string | undefined) {
  const utils = trpcReact.useUtils();
  const store = useDashboardStore();

  const focusAddMutation = trpcReact.arr.focusAdd.useMutation({
    onSuccess: () => {
      if (repoPath) {
        utils.arr.focusStatus.invalidate({ cwd: repoPath });
        utils.arr.workspaceStatus.invalidate({ cwd: repoPath });
      }
    },
  });

  const focusRemoveMutation = trpcReact.arr.focusRemove.useMutation({
    onSuccess: () => {
      if (repoPath) {
        utils.arr.focusStatus.invalidate({ cwd: repoPath });
        utils.arr.workspaceStatus.invalidate({ cwd: repoPath });
      }
    },
  });

  const assignFilesMutation = trpcReact.arr.assignFiles.useMutation({
    onSuccess: () => {
      if (repoPath) {
        utils.arr.listUnassigned.invalidate({ cwd: repoPath });
        utils.arr.workspaceStatus.invalidate({ cwd: repoPath });
        utils.arr.focusStatus.invalidate({ cwd: repoPath });
      }
      store.clearDragState();
    },
    onError: () => {
      store.clearDragState();
    },
  });

  const toggleWorkspaceFocus = async (workspace: string) => {
    if (!repoPath) return;

    const focusStatus = store.focusStatus[repoPath];
    const isFocused = focusStatus?.workspaces.includes(workspace) ?? false;

    if (isFocused) {
      await focusRemoveMutation.mutateAsync({
        workspaces: [workspace],
        cwd: repoPath,
      });
    } else {
      await focusAddMutation.mutateAsync({
        workspaces: [workspace],
        cwd: repoPath,
      });
    }
  };

  const assignFiles = async (files: string[], targetWorkspace: string) => {
    if (!repoPath || files.length === 0) return;

    await assignFilesMutation.mutateAsync({
      patterns: files,
      targetWorkspace,
      cwd: repoPath,
    });
  };

  return {
    toggleWorkspaceFocus,
    assignFiles,
    isAssigning: assignFilesMutation.isPending,
    isFocusMutating:
      focusAddMutation.isPending || focusRemoveMutation.isPending,
  };
}
