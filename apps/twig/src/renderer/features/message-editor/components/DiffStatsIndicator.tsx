import { useDiffStats } from "@hooks/useChangedFiles";
import { Circle } from "@phosphor-icons/react";
import { Flex, Text } from "@radix-ui/themes";

interface DiffStatsIndicatorProps {
  repoPath: string | null | undefined;
}

export function DiffStatsIndicator({ repoPath }: DiffStatsIndicatorProps) {
  const { diffStats } = useDiffStats(repoPath, { refetchInterval: 5000 });

  if (!diffStats || diffStats.filesChanged === 0) {
    return null;
  }

  return (
    <Flex align="center" gap="2">
      <Circle size={4} weight="fill" color="var(--gray-9)" />
      <Text
        size="1"
        style={{
          color: "var(--gray-11)",
          fontFamily: "monospace",
        }}
      >
        {diffStats.filesChanged}{" "}
        {diffStats.filesChanged === 1 ? "file" : "files"}
      </Text>
      <Text
        size="1"
        style={{
          color: "var(--green-9)",
          fontFamily: "monospace",
        }}
      >
        +{diffStats.linesAdded}
      </Text>
      <Text
        size="1"
        style={{
          color: "var(--red-9)",
          fontFamily: "monospace",
        }}
      >
        -{diffStats.linesRemoved}
      </Text>
    </Flex>
  );
}
