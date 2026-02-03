import { DotsCircleSpinner } from "@components/DotsCircleSpinner";
import { useDiffStats } from "@hooks/useChangedFiles";
import {
  ArrowsClockwise,
  BellRinging,
  Cloud,
  GitBranch as GitBranchIcon,
  Laptop as LaptopIcon,
  PushPin,
  PushPinSlash,
  Trash,
} from "@phosphor-icons/react";
import { Tooltip } from "@radix-ui/themes";
import { formatRelativeTime } from "@renderer/utils/time";
import type { WorkspaceMode } from "@shared/types";
import { selectIsFocusedOnWorktree, useFocusStore } from "@stores/focusStore";
import { useMemo } from "react";
import { useCwd } from "../../hooks/useCwd";
import { SidebarItem } from "../SidebarItem";

interface TaskItemProps {
  id: string;
  label: string;
  isActive: boolean;
  workspaceMode?: WorkspaceMode;
  mainRepoPath?: string;
  worktreePath?: string;
  lastActivityAt?: number;
  isGenerating?: boolean;
  isUnread?: boolean;
  isPinned?: boolean;
  needsPermission?: boolean;
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
  taskId: string;
}

function DiffStatsDisplay({ taskId }: DiffStatsDisplayProps) {
  const effectivePath = useCwd(taskId);
  const { diffStats } = useDiffStats(effectivePath, { refetchInterval: 5000 });

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
  id,
  label,
  isActive,
  workspaceMode,
  mainRepoPath,
  worktreePath,
  lastActivityAt,
  isGenerating,
  isUnread,
  isPinned = false,
  needsPermission = false,
  onClick,
  onContextMenu,
  onDelete,
  onTogglePin,
}: TaskItemProps) {
  const isFocused = useFocusStore(
    selectIsFocusedOnWorktree(worktreePath ?? ""),
  );

  const isCloudTask = workspaceMode === "cloud";

  const activityText = needsPermission
    ? "Needs permission"
    : isGenerating
      ? "Generating..."
      : lastActivityAt
        ? formatRelativeTime(lastActivityAt)
        : undefined;

  const repoName = mainRepoPath?.split("/").pop();
  const subtitle = (
    <span className="flex items-center gap-1">
      {repoName && <span>{repoName}</span>}
      {repoName && activityText && <span>·</span>}
      {activityText && (
        <span className={needsPermission ? "text-blue-11" : ""}>
          {activityText}
        </span>
      )}
      {!isCloudTask && <DiffStatsDisplay taskId={id} />}
    </span>
  );

  const isWorktreeTask = workspaceMode === "worktree";

  const modeTooltip = isCloudTask
    ? "Cloud"
    : isWorktreeTask
      ? "Workspace"
      : "Local";

  const icon = needsPermission ? (
    <BellRinging size={16} className="text-blue-11" />
  ) : isGenerating ? (
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
    isFocused ? (
      <Tooltip content="Syncing changes">
        <span className="flex h-4 w-4 items-center justify-center">
          <ArrowsClockwise
            size={16}
            weight="duotone"
            className="animate-sync-rotate text-blue-11"
          />
        </span>
      </Tooltip>
    ) : (
      <Tooltip content={modeTooltip}>
        <GitBranchIcon size={16} />
      </Tooltip>
    )
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
