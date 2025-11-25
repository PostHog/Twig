import { usePanelLayoutStore } from "@features/panels/store/panelLayoutStore";
import { useTaskData } from "@features/task-detail/hooks/useTaskData";
import { ShellTerminal } from "@features/terminal/components/ShellTerminal";
import { useTerminalStore } from "@features/terminal/stores/terminalStore";
import { Box } from "@radix-ui/themes";
import type { Task } from "@shared/types";
import { useEffect } from "react";

interface TaskShellPanelProps {
  taskId: string;
  task: Task;
  shellId?: string;
}

export function TaskShellPanel({ taskId, task, shellId }: TaskShellPanelProps) {
  const taskData = useTaskData({ taskId, initialTask: task });
  const stateKey = shellId ? `${taskId}-${shellId}` : taskId;
  const tabId = shellId || "shell";

  const processName = useTerminalStore(
    (state) => state.terminalStates[stateKey]?.processName,
  );
  const startPolling = useTerminalStore((state) => state.startPolling);
  const stopPolling = useTerminalStore((state) => state.stopPolling);
  const updateTabLabel = usePanelLayoutStore((state) => state.updateTabLabel);

  useEffect(() => {
    startPolling(stateKey);
    return () => stopPolling(stateKey);
  }, [stateKey, startPolling, stopPolling]);

  useEffect(() => {
    if (processName) {
      updateTabLabel(taskId, tabId, processName);
    }
  }, [processName, taskId, tabId, updateTabLabel]);

  return (
    <Box height="100%">
      <ShellTerminal cwd={taskData.repoPath || undefined} stateKey={stateKey} />
    </Box>
  );
}
