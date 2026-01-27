import type { ExecutionMode } from "@features/sessions/stores/sessionStore";
import { useCwd } from "@features/sidebar/hooks/useCwd";
import {
  Circle,
  LockOpen,
  Pause,
  Pencil,
  ShieldCheck,
} from "@phosphor-icons/react";
import { Flex, Select, Text } from "@radix-ui/themes";
import { trpcVanilla } from "@renderer/trpc";
import { EXECUTION_MODES } from "@shared/constants";
import { useQuery } from "@tanstack/react-query";

interface ModeIndicatorInputProps {
  mode: ExecutionMode;
  taskId?: string;
  onModeChange: (mode: ExecutionMode) => void;
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
    icon: <Pause size={12} weight="bold" color="var(--amber-11)" />,
    colorVar: "var(--amber-11)",
  },
  default: {
    label: "default mode",
    icon: <Pencil size={12} color="var(--gray-11)" />,
    colorVar: "var(--gray-11)",
  },
  acceptEdits: {
    label: "auto-accept edits",
    icon: <ShieldCheck size={12} weight="fill" color="var(--green-11)" />,
    colorVar: "var(--green-11)",
  },
  bypassPermissions: {
    label: "bypass permissions",
    icon: <LockOpen size={12} weight="bold" color="var(--red-11)" />,
    colorVar: "var(--red-11)",
  },
};

export function ModeIndicatorInput({
  mode,
  onModeChange,
  taskId,
}: ModeIndicatorInputProps) {
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
    <Select.Root value={mode} onValueChange={onModeChange} size="1">
      <Select.Trigger
        className="w-fit"
        onClick={(e) => {
          e.stopPropagation();
        }}
      >
        <Flex align="center" gap="1">
          {config.icon}
          <Text
            size="1"
            style={{
              color: config.colorVar,
              fontFamily: "monospace",
            }}
          >
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
      </Select.Trigger>
      <Select.Content>
        {EXECUTION_MODES.map((modeOption) => {
          const optionConfig = modeConfig[modeOption];
          const hoverBgClass =
            modeOption === "plan"
              ? "hover:!bg-[var(--amber-11)]"
              : modeOption === "default"
                ? "hover:!bg-[var(--gray-11)]"
                : modeOption === "acceptEdits"
                  ? "hover:!bg-[var(--green-11)]"
                  : "hover:!bg-[var(--red-11)]";
          return (
            <Select.Item
              key={modeOption}
              value={modeOption}
              className={`group transition-colors ${hoverBgClass}`}
            >
              <Flex
                align="center"
                gap="1"
                className="group-hover:!text-[black] [&_svg]:group-hover:!text-[black] [&_svg]:group-hover:!fill-[black] [&_svg_path]:group-hover:!fill-[black] [&_svg_path]:group-hover:!stroke-[black]"
                style={{
                  color: optionConfig.colorVar,
                  fontFamily: "monospace",
                }}
              >
                <span className="group-hover:[&_svg]:!text-[black] group-hover:[&_svg]:!fill-[black] group-hover:[&_svg_path]:!fill-[black] group-hover:[&_svg_path]:!stroke-[black]">
                  {optionConfig.icon}
                </span>
                <Text size="1" className="group-hover:!text-[black]">
                  {optionConfig.label}
                </Text>
              </Flex>
            </Select.Item>
          );
        })}
      </Select.Content>
      <style>{`
        .group:hover svg {
          color: black !important;
          fill: black !important;
        }
        .group:hover svg path {
          fill: black !important;
          stroke: black !important;
        }
      `}</style>
    </Select.Root>
  );
}
