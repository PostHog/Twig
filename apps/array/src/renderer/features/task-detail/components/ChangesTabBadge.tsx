import { useTaskData } from "@features/task-detail/hooks/useTaskData";
import { Flex, Text } from "@radix-ui/themes";
import { trpcVanilla } from "@renderer/trpc";
import type { Task } from "@shared/types";
import { useQuery } from "@tanstack/react-query";
import {
  selectWorktreePath,
  useWorkspaceStore,
} from "@/renderer/features/workspace/stores/workspaceStore";

interface ChangesTabBadgeProps {
  taskId: string;
  task: Task;
}

export function ChangesTabBadge({ taskId, task }: ChangesTabBadgeProps) {
  const taskData = useTaskData({ taskId, initialTask: task });
  const worktreePath = useWorkspaceStore(selectWorktreePath(taskId));
  const repoPath = worktreePath ?? taskData.repoPath;

  const { data: diffStats } = useQuery({
    queryKey: ["diff-stats", repoPath],
    queryFn: () =>
      trpcVanilla.git.getDiffStats.query({
        directoryPath: repoPath as string,
      }),
    enabled: !!repoPath,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
  });

  if (!diffStats || diffStats.filesChanged === 0) {
    return null;
  }

  const filesLabel = diffStats.filesChanged === 1 ? "file" : "files";

  return (
    <Flex gap="2" mr="2">
      {diffStats.linesAdded > 0 && (
        <Text size="1">
          <Text size="1" color="green">
            +{diffStats.linesAdded}
          </Text>
          ,
        </Text>
      )}
      {diffStats.linesRemoved > 0 && (
        <Text size="1">
          <Text size="1" color="red">
            -{diffStats.linesRemoved}
          </Text>
          ,
        </Text>
      )}
      <Text size="1">
        <Text color="blue">{diffStats.filesChanged}</Text> {filesLabel} changed
      </Text>
    </Flex>
  );
}
