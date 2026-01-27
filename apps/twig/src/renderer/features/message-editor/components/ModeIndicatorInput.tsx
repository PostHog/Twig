import type { ExecutionMode } from "@features/sessions/stores/sessionStore";
import { useCwd } from "@features/sidebar/hooks/useCwd";
import {
  Circle,
  LockOpen,
  Pause,
  Pencil,
  ShieldCheck,
} from "@phosphor-icons/react";
import { Flex, Text } from "@radix-ui/themes";
import { trpcVanilla } from "@renderer/trpc";
import { useQuery } from "@tanstack/react-query";

interface ModeIndicatorInputProps {
  mode: ExecutionMode;
  taskId?: string;
}

const modeConfig: Record<
  ExecutionMode,
  {
    label: string;
    icon: React.ReactNode;
    colorVar: string;
  }
> = {
  plan: {
    label: "plan mode on",
    icon: <Pause size={12} weight="bold" />,
    colorVar: "var(--amber-11)",
  },
  default: {
    label: "default mode",
    icon: <Pencil size={12} />,
    colorVar: "var(--gray-11)",
  },
  acceptEdits: {
    label: "auto-accept edits",
    icon: <ShieldCheck size={12} weight="fill" />,
    colorVar: "var(--green-11)",
  },
  bypassPermissions: {
    label: "bypass permissions",
    icon: <LockOpen size={12} weight="bold" />,
    colorVar: "var(--red-11)",
  },
};

export function ModeIndicatorInput({ mode, taskId }: ModeIndicatorInputProps) {
  const config = modeConfig[mode];
  const repoPath = useCwd(taskId ?? "");

  const { data: diffStats } = useQuery({
    queryKey: ["diff-stats", repoPath],
    queryFn: () =>
      trpcVanilla.git.getDiffStats.query({
        directoryPath: repoPath as string,
      }),
    enabled: !!repoPath && !!taskId,
    staleTime: 5000,
    refetchInterval: 5000,
    placeholderData: (prev) => prev,
  });

  const hasDiffStats = diffStats && diffStats.filesChanged > 0;

  return (
    <Flex align="center" justify="between" py="1">
      <Flex align="center" gap="1">
        <Text
          size="1"
          style={{
            color: config.colorVar,
            fontFamily: "monospace",
            display: "flex",
            alignItems: "center",
            gap: "4px",
          }}
        >
          {config.icon}
          {config.label}
        </Text>
        <Text
          size="1"
          style={{
            color: "var(--gray-9)",
            fontFamily: "monospace",
          }}
        >
          (shift+tab to cycle)
        </Text>
        {hasDiffStats && (
          <Text
            size="1"
            style={{
              color: "var(--gray-9)",
              fontFamily: "monospace",
              display: "flex",
              alignItems: "center",
              gap: "6px",
            }}
          >
            <Circle size={4} weight="fill" style={{ margin: "0 4px" }} />
            <span style={{ color: "var(--gray-11)" }}>
              {diffStats.filesChanged}{" "}
              {diffStats.filesChanged === 1 ? "file" : "files"}
            </span>
            <span style={{ color: "var(--green-9)" }}>
              +{diffStats.linesAdded}
            </span>
            <span style={{ color: "var(--red-9)" }}>
              -{diffStats.linesRemoved}
            </span>
          </Text>
        )}
      </Flex>
    </Flex>
  );
}
