import { DotsCircleSpinner } from "@components/DotsCircleSpinner";
import {
  Cloud,
  GitBranch as GitBranchIcon,
  Laptop as LaptopIcon,
  PushPin,
  PushPinSlash,
  Trash,
} from "@phosphor-icons/react";
import { Tooltip } from "@radix-ui/themes";
import { trpcVanilla } from "@renderer/trpc";
import { formatRelativeTime } from "@renderer/utils/time";
import type { WorkspaceMode } from "@shared/types";
import { selectFocusedBranch, useFocusStore } from "@stores/focusStore";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { SidebarItem } from "../SidebarItem";

interface TaskItemProps {
  id: string;
  label: string;
  isActive: boolean;
  worktreePath?: string;
  workspaceMode?: WorkspaceMode;
  mainRepoPath?: string;
  branchName?: string;
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
      {/* biome-ignore lint/a11y/useSemanticElements: Cannot use button inside parent button (SidebarItem) */}
      <span
        role="button"
        tabIndex={0}
        className="flex h-5 w-5 cursor-pointer items-center justify-center rounded text-gray-10 transition-colors hover:bg-gray-4 hover:text-gray-12"
        onClick={(e) => {
          e.stopPropagation();
          onTogglePin();
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.stopPropagation();
            onTogglePin();
          }
        }}
        title={isPinned ? "Unpin task" : "Pin task"}
      >
        {isPinned ? <PushPinSlash size={12} /> : <PushPin size={12} />}
      </span>
      {/* biome-ignore lint/a11y/useSemanticElements: Cannot use button inside parent button (SidebarItem) */}
      <span
        role="button"
        tabIndex={0}
        className="flex h-5 w-5 cursor-pointer items-center justify-center rounded text-gray-10 transition-colors hover:bg-red-4 hover:text-red-11"
        onClick={(e) => {
          e.stopPropagation();
          onDelete();
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.stopPropagation();
            onDelete();
          }
        }}
        title="Delete task"
      >
        <Trash size={12} />
      </span>
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
    staleTime: 5000,
    refetchInterval: 5000,
    placeholderData: (prev) => prev,
  });

  if (!diffStats || diffStats.filesChanged === 0) {
    return null;
  }

  const parts: React.ReactNode[] = [];
  if (diffStats.linesAdded > 0) {
    parts.push(
      <span key="added" className="text-green-9">
        +{diffStats.linesAdded}
      </span>,
    );
  }
  if (diffStats.linesRemoved > 0) {
    parts.push(
      <span key="removed" className="text-red-9">
        -{diffStats.linesRemoved}
      </span>,
    );
  }
  parts.push(
    <span key="files" className="text-gray-11">
      {diffStats.filesChanged}
    </span>,
  );

  return (
    <span className="flex items-center gap-1">
      <span>·</span>
      {parts}
    </span>
  );
}

export function TaskItem({
  label,
  isActive,
  worktreePath,
  workspaceMode,
  mainRepoPath,
  branchName,
  lastActivityAt,
  isGenerating,
  isUnread,
  isPinned = false,
  onClick,
  onContextMenu,
  onDelete,
  onTogglePin,
}: TaskItemProps) {
  const focusedBranch = useFocusStore(selectFocusedBranch(mainRepoPath ?? ""));

  const isCloudTask = workspaceMode === "cloud";
  const isTwigBranch =
    branchName?.startsWith("twig/") ||
    branchName?.startsWith("array/") ||
    branchName?.startsWith("posthog/");
  // Only show "Watching" indicator for twig-created branches, not borrowed ones
  const isWatching = !!(
    branchName &&
    focusedBranch === branchName &&
    isTwigBranch
  );

  const activityText = isGenerating
    ? "Generating..."
    : lastActivityAt
      ? formatRelativeTime(lastActivityAt)
      : undefined;

  const repoName = mainRepoPath?.split("/").pop();
  const subtitle = (
    <span className="flex items-center gap-1">
      {repoName && <span>{repoName}</span>}
      {repoName && activityText && <span>·</span>}
      {activityText && <span>{activityText}</span>}
      {!isCloudTask && worktreePath && (
        <DiffStatsDisplay worktreePath={worktreePath} />
      )}
    </span>
  );

  const isWorktreeTask = workspaceMode === "worktree";

  const modeTooltip = isCloudTask
    ? "Cloud"
    : isWorktreeTask
      ? "Workspace"
      : "Local";

  const icon = isGenerating ? (
    <DotsCircleSpinner size={16} className="text-accent-11" />
  ) : isUnread ? (
    <span className="flex h-4 w-4 items-center justify-center text-[8px] text-green-11">
      ■
    </span>
  ) : isPinned ? (
    <PushPin size={16} className="text-accent-11" />
  ) : isCloudTask ? (
    <Tooltip content={modeTooltip}>
      <Cloud size={16} />
    </Tooltip>
  ) : isWorktreeTask ? (
    <Tooltip content={modeTooltip}>
      <GitBranchIcon size={16} className={isWatching ? "text-blue-11" : ""} />
    </Tooltip>
  ) : (
    <Tooltip content={modeTooltip}>
      <LaptopIcon size={16} />
    </Tooltip>
  );

  const endContent = useMemo(
    () =>
      onDelete && onTogglePin ? (
        <TaskHoverToolbar
          isPinned={isPinned}
          onDelete={onDelete}
          onTogglePin={onTogglePin}
        />
      ) : null,
    [onDelete, onTogglePin, isPinned],
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
