import { useTaskData } from "@features/task-detail/hooks/useTaskData";
import { Text } from "@radix-ui/themes";
import type { Task } from "@shared/types";
import { useQuery } from "@tanstack/react-query";

interface ChangesTabBadgeProps {
  taskId: string;
  task: Task;
}

export function ChangesTabBadge({ taskId, task }: ChangesTabBadgeProps) {
  const taskData = useTaskData({ taskId, initialTask: task });
  const repoPath = taskData.repoPath;

  const { data: changedFiles = [] } = useQuery({
    queryKey: ["changed-files-head", repoPath],
    queryFn: () => window.electronAPI.getChangedFilesHead(repoPath as string),
    enabled: !!repoPath,
    staleTime: Infinity,
  });

  if (changedFiles.length === 0) {
    return null;
  }

  return (
    <Text size="1" color="orange" >
      ({changedFiles.length})
    </Text>
  );
}
