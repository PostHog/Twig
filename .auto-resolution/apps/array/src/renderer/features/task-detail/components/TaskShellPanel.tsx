import { useTaskData } from "@features/task-detail/hooks/useTaskData";
import { ShellTerminal } from "@features/terminal/components/ShellTerminal";
import { Box } from "@radix-ui/themes";
import type { Task } from "@shared/types";

interface TaskShellPanelProps {
  taskId: string;
  task: Task;
}

export function TaskShellPanel({ taskId, task }: TaskShellPanelProps) {
  const taskData = useTaskData({ taskId, initialTask: task });

  return (
    <Box height="100%">
      <ShellTerminal cwd={taskData.repoPath || undefined} />
    </Box>
  );
}
