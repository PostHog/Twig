import { useCallback } from "react";
import {
  selectIsCreating,
  selectWorkspace,
  useWorkspaceStore,
} from "../stores/workspaceStore";
import { useWorkspaceTerminalStore } from "../stores/workspaceTerminalStore";

interface WorkspaceStatus {
  hasWorkspace: boolean;
  isRunning: boolean;
  isCreating: boolean;
  isCheckingStatus: boolean;
  refreshStatus: () => void;
}

export function useWorkspaceStatus(taskId: string): WorkspaceStatus {
  const workspace = useWorkspaceStore(selectWorkspace(taskId));
  const isCreating = useWorkspaceStore(selectIsCreating(taskId));
  const terminalsRunning = useWorkspaceTerminalStore((s) =>
    s.areTerminalsRunning(taskId),
  );

  const refreshStatus = useCallback(() => {
    // Status is now derived directly from the terminal store
    // This is kept for API compatibility
  }, []);

  return {
    hasWorkspace: !!workspace,
    isRunning: terminalsRunning,
    isCreating,
    isCheckingStatus: false,
    refreshStatus,
  };
}
