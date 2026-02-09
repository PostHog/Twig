import { useCwd } from "@features/sidebar/hooks/useCwd";
import {
  resolveGitDiffMode,
  useChangesModeStore,
} from "@features/task-detail/stores/changesModeStore";
import { Flex, Text } from "@radix-ui/themes";
import { trpcVanilla } from "@renderer/trpc";
import type { Task } from "@shared/types";
import { useQuery } from "@tanstack/react-query";

interface ChangesTabBadgeProps {
  taskId: string;
  task: Task;
}

export function ChangesTabBadge({ taskId, task: _task }: ChangesTabBadgeProps) {
  const repoPath = useCwd(taskId);
  const mode = useChangesModeStore((s) => s.mode);
  const gitDiffMode = resolveGitDiffMode(mode);

  const { data: diffStats } = useQuery({
    queryKey: ["diff-stats-mode", repoPath, gitDiffMode],
    queryFn: () =>
      trpcVanilla.git.getDiffStatsByMode.query({
        directoryPath: repoPath as string,
        mode: gitDiffMode === "lastTurn" ? "uncommitted" : gitDiffMode,
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
