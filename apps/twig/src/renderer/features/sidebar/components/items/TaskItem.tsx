import { DotsCircleSpinner } from "@components/DotsCircleSpinner";
import {
  ArrowsClockwise,
  BellRinging,
  Cloud,
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
  label: string;
  isActive: boolean;
  workspaceMode?: WorkspaceMode;
  worktreePath?: string;
  isGenerating?: boolean;
  isUnread?: boolean;
  isPinned?: boolean;
  needsPermission?: boolean;
  onClick: () => void;
  onContextMenu: (e: React.MouseEvent) => void;
  onDelete?: () => void;
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
  label,
  isActive,
  workspaceMode,
  worktreePath,
  isGenerating,
  isUnread,
  isPinned = false,
  needsPermission = false,
  onClick,
  onContextMenu,
  onDelete,
}: TaskItemProps) {
  const isFocused = useFocusStore(
    selectIsFocusedOnWorktree(worktreePath ?? ""),
  );

  const isCloudTask = workspaceMode === "cloud";
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
  ) : isCloudTask ? (
    <Cloud size={ICON_SIZE} />
  ) : isWorktreeTask ? (
    isFocused ? (
      <ArrowsClockwise
        size={ICON_SIZE}
        weight="duotone"
        className="animate-sync-rotate text-blue-11"
      />
    ) : (
      <GitBranchIcon size={ICON_SIZE} />
    )
  ) : (
    <LaptopIcon size={ICON_SIZE} />
  );

  const endContent = useMemo(
    () => (onDelete ? <TaskHoverToolbar onDelete={onDelete} /> : null),
    [onDelete],
  );

  return (
    <SidebarItem
      depth={0}
      icon={icon}
      label={label}
      isActive={isActive}
      onClick={onClick}
      onContextMenu={onContextMenu}
      endContent={endContent}
    />
  );
}
