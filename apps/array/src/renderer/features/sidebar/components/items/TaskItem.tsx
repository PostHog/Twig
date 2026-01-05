import { DotsCircleSpinner } from "@components/DotsCircleSpinner";
import {
  Cloud,
  GitBranch as GitBranchIcon,
  PushPin,
  PushPinSlash,
  Trash,
} from "@phosphor-icons/react";
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
  isPinned?: boolean;
  onClick: () => void;
  onContextMenu: (e: React.MouseEvent) => void;
  onDelete?: () => void;
  onTogglePin?: () => void;
}

interface TaskHoverToolbarProps {
  isPinned: boolean;
  onDelete: () => void;
  onTogglePin: () => void;
}

function TaskHoverToolbar({
  isPinned,
  onDelete,
  onTogglePin,
}: TaskHoverToolbarProps) {
  return (
    <span className="hidden shrink-0 items-center gap-0.5 group-hover:flex">
      <button
        type="button"
        className="flex h-5 w-5 items-center justify-center rounded text-gray-10 transition-colors hover:bg-gray-4 hover:text-gray-12"
        onClick={(e) => {
          e.stopPropagation();
          onTogglePin();
        }}
        title={isPinned ? "Unpin task" : "Pin task"}
      >
        {isPinned ? <PushPinSlash size={12} /> : <PushPin size={12} />}
      </button>
      <button
        type="button"
        className="flex h-5 w-5 items-center justify-center rounded text-gray-10 transition-colors hover:bg-red-4 hover:text-red-11"
        onClick={(e) => {
          e.stopPropagation();
          onDelete();
        }}
        title="Delete task"
      >
        <Trash size={12} />
      </button>
    </span>
  );
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
  isPinned = false,
  onClick,
  onContextMenu,
  onDelete,
  onTogglePin,
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
  ) : isPinned ? (
    <PushPin size={12} className="text-accent-11" />
  ) : (
    <GitBranchIcon size={12} />
  );

  const endContent = (
    <span className="flex items-center gap-1">
      {!isCloudTask && worktreePath && (
        <span className="group-hover:hidden">
          <DiffStatsDisplay worktreePath={worktreePath} />
        </span>
      )}
      {onDelete && onTogglePin && (
        <TaskHoverToolbar
          isPinned={isPinned}
          onDelete={onDelete}
          onTogglePin={onTogglePin}
        />
      )}
    </span>
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
      endContent={endContent}
    />
  );
}
