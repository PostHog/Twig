import { DotsCircleSpinner } from "@components/DotsCircleSpinner";
import { Cloud, GitBranch as GitBranchIcon } from "@phosphor-icons/react";
import { trpcVanilla } from "@renderer/trpc";
import { formatRelativeTime } from "@renderer/utils/time";
import type { WorkspaceMode } from "@shared/types";
import { useQuery } from "@tanstack/react-query";
import { SidebarItem } from "../SidebarItem";

function useCurrentBranch(repoPath?: string, worktreeName?: string) {
  return useQuery({
    queryKey: ["current-branch", repoPath],
    queryFn: () => {
      if (!repoPath) throw new Error("repoPath is required");
      return trpcVanilla.git.getCurrentBranch.query({
        directoryPath: repoPath,
      });
    },
    enabled: !!repoPath && !worktreeName,
    staleTime: 3000,
    refetchInterval: 3000,
  });
}

interface TaskItemProps {
  id: string;
  label: string;
  isActive: boolean;
  worktreeName?: string;
  worktreePath?: string;
  workspaceMode?: WorkspaceMode;
  lastActivityAt?: number;
  isGenerating?: boolean;
  isUnread?: boolean;
  onClick: () => void;
  onContextMenu: (e: React.MouseEvent) => void;
}

interface DiffStatsDisplayProps {
  worktreePath: string;
}

function DiffStatsDisplay({ worktreePath }: DiffStatsDisplayProps) {
  const { data: diffStats } = useQuery({
    queryKey: ["diff-stats", worktreePath],
    queryFn: () =>
      trpcVanilla.git.getDiffStats.query({ directoryPath: worktreePath }),
    enabled: !!worktreePath,
    staleTime: 30000,
    refetchOnWindowFocus: false,
  });

  if (!diffStats || diffStats.filesChanged === 0) {
    return null;
  }

  const parts: React.ReactNode[] = [];
  if (diffStats.linesAdded > 0) {
    parts.push(
      <span key="added" style={{ color: "var(--green-9)" }}>
        +{diffStats.linesAdded}
      </span>,
    );
  }
  if (diffStats.linesRemoved > 0) {
    parts.push(
      <span key="removed" style={{ color: "var(--red-9)" }}>
        -{diffStats.linesRemoved}
      </span>,
    );
  }
  parts.push(<span key="files">{diffStats.filesChanged}</span>);

  return (
    <span
      className="flex shrink-0 items-center rounded border border-gray-6 bg-gray-2 px-1 text-[10px] text-gray-11"
      style={{ gap: "4px" }}
    >
      {parts}
    </span>
  );
}

export function TaskItem({
  label,
  isActive,
  worktreeName,
  worktreePath,
  workspaceMode,
  lastActivityAt,
  isGenerating,
  isUnread,
  onClick,
  onContextMenu,
}: TaskItemProps) {
  const { data: currentBranch } = useCurrentBranch(worktreePath, worktreeName);

  const isCloudTask = workspaceMode === "cloud";

  const activityText = isGenerating
    ? "Generating..."
    : lastActivityAt
      ? formatRelativeTime(lastActivityAt)
      : undefined;

  const baseSubtitle = isCloudTask ? (
    <span style={{ display: "flex", alignItems: "center", gap: "4px" }}>
      <Cloud size={10} />
      <span>Cloud</span>
    </span>
  ) : (
    (worktreeName ?? currentBranch)
  );

  const subtitle = activityText ? (
    <span>
      {baseSubtitle && <>{baseSubtitle} · </>}
      {activityText}
    </span>
  ) : (
    baseSubtitle
  );

  const icon = isGenerating ? (
    <DotsCircleSpinner size={12} className="text-accent-11" />
  ) : isUnread ? (
    <span className="flex h-[12px] w-[12px] items-center justify-center text-[8px] text-green-11">
      ■
    </span>
  ) : (
    <GitBranchIcon size={12} />
  );

  return (
    <SidebarItem
      depth={0}
      icon={icon}
      label={label}
      subtitle={subtitle}
      isActive={isActive}
      onClick={onClick}
      onContextMenu={onContextMenu}
      endContent={
        !isCloudTask && worktreePath ? (
          <DiffStatsDisplay worktreePath={worktreePath} />
        ) : undefined
      }
    />
  );
}
