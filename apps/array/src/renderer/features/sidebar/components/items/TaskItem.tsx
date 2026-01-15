import { DotsCircleSpinner } from "@components/DotsCircleSpinner";
import { DiffStatsBadge } from "@components/ui/DiffStatsBadge";
import { FocusToggleButton } from "@components/ui/FocusToggleButton";
import {
  Eye,
  GitBranch as GitBranchIcon,
  PushPin,
  PushPinSlash,
  Trash,
} from "@phosphor-icons/react";
import { trpcVanilla } from "@renderer/trpc";
import { formatRelativeTime } from "@renderer/utils/time";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { SidebarItem } from "../SidebarItem";

function useCurrentBranch(repoPath?: string, workspaceName?: string) {
  return useQuery({
    queryKey: ["current-branch", repoPath],
    queryFn: () => {
      if (!repoPath) throw new Error("repoPath is required");
      return trpcVanilla.git.getCurrentBranch.query({
        directoryPath: repoPath,
      });
    },
    enabled: !!repoPath && !workspaceName,
    staleTime: 3000,
    refetchInterval: 3000,
  });
}

interface TaskItemProps {
  id: string;
  label: string;
  isActive: boolean;
  workspaceName?: string;
  workspacePath?: string;
  lastActivityAt?: number;
  isGenerating?: boolean;
  isUnread?: boolean;
  isPinned?: boolean;
  isFocused?: boolean;
  onClick: () => void;
  onContextMenu: (e: React.MouseEvent) => void;
  onDelete?: () => void;
  onTogglePin?: () => void;
  onToggleFocus?: () => void;
}

interface TaskHoverToolbarProps {
  isPinned: boolean;
  isFocused: boolean;
  hasFocus: boolean;
  onDelete: () => void;
  onTogglePin: () => void;
  onToggleFocus?: () => void;
}

function TaskHoverToolbar({
  isPinned,
  isFocused,
  hasFocus,
  onDelete,
  onTogglePin,
  onToggleFocus,
}: TaskHoverToolbarProps) {
  return (
    <span className="hidden shrink-0 items-center gap-0.5 group-hover:flex">
      {hasFocus && onToggleFocus && (
        <FocusToggleButton isFocused={isFocused} onToggle={onToggleFocus} />
      )}
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
  workspacePath: string;
}

function DiffStatsDisplay({ workspacePath }: DiffStatsDisplayProps) {
  const { data: diffStats } = useQuery({
    queryKey: ["diff-stats", workspacePath],
    queryFn: () =>
      trpcVanilla.git.getDiffStats.query({ directoryPath: workspacePath }),
    enabled: !!workspacePath,
    staleTime: 30000,
    refetchOnWindowFocus: false,
  });

  if (!diffStats || diffStats.filesChanged === 0) {
    return null;
  }

  return (
    <DiffStatsBadge
      added={diffStats.linesAdded}
      removed={diffStats.linesRemoved}
      files={diffStats.filesChanged}
    />
  );
}

export function TaskItem({
  label,
  isActive,
  workspaceName,
  workspacePath,
  lastActivityAt,
  isGenerating,
  isUnread,
  isPinned = false,
  isFocused = false,
  onClick,
  onContextMenu,
  onDelete,
  onTogglePin,
  onToggleFocus,
}: TaskItemProps) {
  const { data: currentBranch } = useCurrentBranch(
    workspacePath,
    workspaceName,
  );

  const activityText = isGenerating
    ? "Generating..."
    : lastActivityAt
      ? formatRelativeTime(lastActivityAt)
      : undefined;

  const baseSubtitle = workspaceName ?? currentBranch;

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
  ) : isFocused ? (
    <Eye size={12} className="text-accent-11" weight="fill" />
  ) : isPinned ? (
    <PushPin size={12} className="text-accent-11" />
  ) : (
    <GitBranchIcon size={12} />
  );

  const endContent = useMemo(
    () => (
      <span className="flex items-center gap-1">
        {workspacePath && (
          <span className="group-hover:hidden">
            <DiffStatsDisplay workspacePath={workspacePath} />
          </span>
        )}
        {onDelete && onTogglePin && (
          <TaskHoverToolbar
            isPinned={isPinned}
            isFocused={isFocused}
            hasFocus={!!workspaceName}
            onDelete={onDelete}
            onTogglePin={onTogglePin}
            onToggleFocus={onToggleFocus}
          />
        )}
      </span>
    ),
    [
      workspacePath,
      onDelete,
      onTogglePin,
      isPinned,
      isFocused,
      workspaceName,
      onToggleFocus,
    ],
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
