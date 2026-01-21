import { useTaskData } from "@features/task-detail/hooks/useTaskData";
import { Flex, Text } from "@radix-ui/themes";
import { trpcVanilla } from "@renderer/trpc";
import type { Task } from "@shared/types";
import { useQuery } from "@tanstack/react-query";
import { useEffectiveWorktreePath } from "@/renderer/features/sidebar/hooks/useEffectiveWorktreePath";
import { useWorkspaceStore } from "@/renderer/features/workspace/stores/workspaceStore";

interface ChangesTabBadgeProps {
  taskId: string;
  task: Task;
}

export function ChangesTabBadge({ taskId, task }: ChangesTabBadgeProps) {
  const taskData = useTaskData({ taskId, initialTask: task });
  const workspace = useWorkspaceStore((s) => s.workspaces[taskId]);
  // Use workspace.mode as source of truth (not taskState.workspaceMode which may default incorrectly)
  const repoPath = useEffectiveWorktreePath(
    workspace?.worktreePath,
    workspace?.folderPath ?? taskData.repoPath,
    workspace?.mode,
  );

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
          <Text size="1" style={{ color: "var(--green-9)" }}>
            +{diffStats.linesAdded}
          </Text>
          ,
        </Text>
      )}
      {diffStats.linesRemoved > 0 && (
        <Text size="1">
          <Text size="1" style={{ color: "var(--red-9)" }}>
            -{diffStats.linesRemoved}
          </Text>
          ,
        </Text>
      )}
      <Text size="1">
        <Text style={{ color: "var(--blue-9)" }}>{diffStats.filesChanged}</Text>{" "}
        {filesLabel} changed
      </Text>
    </Flex>
  );
}
