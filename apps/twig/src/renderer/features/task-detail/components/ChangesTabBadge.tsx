import { useCwd } from "@features/sidebar/hooks/useCwd";
import { useDiffStats } from "@hooks/useChangedFiles";
import { Flex, Text } from "@radix-ui/themes";

interface ChangesTabBadgeProps {
  taskId: string;
}

export function ChangesTabBadge({ taskId }: ChangesTabBadgeProps) {
  const repoPath = useCwd(taskId);
  const { diffStats } = useDiffStats(repoPath);

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
