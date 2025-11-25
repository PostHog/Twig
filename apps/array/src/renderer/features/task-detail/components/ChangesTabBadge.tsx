import { useTaskData } from "@features/task-detail/hooks/useTaskData";
import { Flex, Text } from "@radix-ui/themes";
import type { Task } from "@shared/types";
import { useQuery } from "@tanstack/react-query";

interface ChangesTabBadgeProps {
  taskId: string;
  task: Task;
}

export function ChangesTabBadge({ taskId, task }: ChangesTabBadgeProps) {
  const taskData = useTaskData({ taskId, initialTask: task });
  const repoPath = taskData.repoPath;

  const { data: diffStats } = useQuery({
    queryKey: ["diff-stats", repoPath],
    queryFn: () => window.electronAPI.getDiffStats(repoPath as string),
    enabled: !!repoPath,
    staleTime: Infinity,
  });

  if (!diffStats || diffStats.filesChanged === 0) {
    return null;
  }

  return (
    <Flex gap="1">
      <Text size="1" color="blue">
        {diffStats.filesChanged}
      </Text>
      {diffStats.linesAdded > 0 && (
        <>
          {" "}
          <Text size="1" color="green">
            +{diffStats.linesAdded}
          </Text>
        </>
      )}
      {diffStats.linesRemoved > 0 && (
        <Text size="1" color="red">
          -{diffStats.linesRemoved}
        </Text>
      )}
    </Flex>
  );
}
