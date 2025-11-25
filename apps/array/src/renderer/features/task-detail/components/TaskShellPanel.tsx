import { useTaskData } from "@features/task-detail/hooks/useTaskData";
import { ShellTerminal } from "@features/terminal/components/ShellTerminal";
import { Box } from "@radix-ui/themes";
import type { Task } from "@shared/types";

interface TaskShellPanelProps {
  taskId: string;
  task: Task;
  shellId?: string;
}

export function TaskShellPanel({ taskId, task, shellId }: TaskShellPanelProps) {
  const taskData = useTaskData({ taskId, initialTask: task });
  const stateKey = shellId ? `${taskId}-${shellId}` : taskId;

  return (
    <Box height="100%">
      <ShellTerminal cwd={taskData.repoPath || undefined} stateKey={stateKey} />
    </Box>
  );
}
