import { DotsCircleSpinner } from "@components/DotsCircleSpinner";
import { Tooltip } from "@components/ui/Tooltip";
import {
  ArrowsClockwise,
  BellRinging,
  GitBranch as GitBranchIcon,
  Laptop as LaptopIcon,
  PushPin,
  Trash,
} from "@phosphor-icons/react";
import type { WorkspaceMode } from "@shared/types";
import { selectIsFocusedOnWorktree, useFocusStore } from "@stores/focusStore";
import { useMemo } from "react";
import { SidebarItem } from "../SidebarItem";

interface TaskItemProps {
  depth?: number;
  label: string;
  isActive: boolean;
  workspaceMode?: WorkspaceMode;
  worktreePath?: string;
  isGenerating?: boolean;
  isUnread?: boolean;
  isPinned?: boolean;
  needsPermission?: boolean;
  timestamp?: number;
  onClick: () => void;
  onContextMenu: (e: React.MouseEvent) => void;
  onDelete?: () => void;
}

function formatRelativeTime(timestamp: number): string {
  const now = Date.now();
  const diff = now - timestamp;

  const minutes = Math.floor(diff / (1000 * 60));
  const hours = Math.floor(diff / (1000 * 60 * 60));
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const weeks = Math.floor(days / 7);
  const months = Math.floor(days / 30);
  const years = Math.floor(days / 365);

  if (years > 0) return `${years}y`;
  if (months > 0) return `${months}mo`;
  if (weeks > 0) return `${weeks}w`;
  if (days > 0) return `${days}d`;
  if (hours > 0) return `${hours}h`;
  if (minutes > 0) return `${minutes}m`;
  return "now";
}

interface TaskHoverToolbarProps {
  onDelete: () => void;
}

function TaskHoverToolbar({ onDelete }: TaskHoverToolbarProps) {
  return (
    <span className="hidden shrink-0 items-center gap-0.5 group-hover:flex">
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

const ICON_SIZE = 12;

export function TaskItem({
  depth = 0,
  label,
  isActive,
  workspaceMode,
  worktreePath,
  isGenerating,
  isUnread,
  isPinned = false,
  needsPermission = false,
  timestamp,
  onClick,
  onContextMenu,
  onDelete,
}: TaskItemProps) {
  const isFocused = useFocusStore(
    selectIsFocusedOnWorktree(worktreePath ?? ""),
  );

  const isWorktreeTask = workspaceMode === "worktree";

  const icon = needsPermission ? (
    <BellRinging size={ICON_SIZE} className="text-blue-11" />
  ) : isGenerating ? (
    <DotsCircleSpinner size={ICON_SIZE} className="text-accent-11" />
  ) : isUnread ? (
    <span className="flex items-center justify-center text-[8px] text-green-11">
      ■
    </span>
  ) : isPinned ? (
    <PushPin size={ICON_SIZE} className="text-accent-11" />
  ) : isWorktreeTask ? (
    isFocused ? (
      <Tooltip content="Worktree (syncing)" side="right">
        <span className="flex items-center justify-center">
          <ArrowsClockwise
            size={ICON_SIZE}
            weight="duotone"
            className="animate-sync-rotate text-blue-11"
          />
        </span>
      </Tooltip>
    ) : (
      <Tooltip content="Worktree" side="right">
        <span className="flex items-center justify-center">
          <GitBranchIcon size={ICON_SIZE} />
        </span>
      </Tooltip>
    )
  ) : (
    <Tooltip content="Local" side="right">
      <span className="flex items-center justify-center">
        <LaptopIcon size={ICON_SIZE} />
      </span>
    </Tooltip>
  );

  const endContent = useMemo(() => {
    const timestampNode = timestamp ? (
      <span className="shrink-0 text-[10px] text-gray-11 group-hover:hidden">
        {formatRelativeTime(timestamp)}
      </span>
    ) : null;

    const toolbar = onDelete ? <TaskHoverToolbar onDelete={onDelete} /> : null;

    if (!timestampNode && !toolbar) return null;

    return (
      <>
        {timestampNode}
        {toolbar}
      </>
    );
  }, [timestamp, onDelete]);

  return (
    <SidebarItem
      depth={depth}
      icon={icon}
      label={label}
      isActive={isActive}
      onClick={onClick}
      onContextMenu={onContextMenu}
      endContent={endContent}
    />
  );
}
