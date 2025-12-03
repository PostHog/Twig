import {
  CheckCircleIcon,
  CircleIcon,
  Cloud,
  XCircleIcon,
} from "@phosphor-icons/react";
import type { WorkspaceMode } from "@shared/types";
import { useQuery } from "@tanstack/react-query";
import type { TaskStatus } from "../../types";
import { SidebarItem } from "../SidebarItem";

function useCurrentBranch(repoPath?: string, worktreeName?: string) {
  return useQuery({
    queryKey: ["current-branch", repoPath],
    queryFn: () => window.electronAPI.getCurrentBranch(repoPath!),
    enabled: !!repoPath && !worktreeName,
    staleTime: 3000,
    refetchInterval: 3000,
  });
}

interface TaskItemProps {
  id: string;
  label: string;
  status: TaskStatus;
  isActive: boolean;
  worktreeName?: string;
  worktreePath?: string;
  workspaceMode?: WorkspaceMode;
  onClick: () => void;
  onContextMenu: (e: React.MouseEvent) => void;
}

function getStatusIcon(status: TaskStatus) {
  if (status === "in_progress" || status === "started") {
    return (
      <CircleIcon size={12} weight="fill" style={{ color: "var(--blue-9)" }} />
    );
  }
  if (status === "completed") {
    return (
      <CheckCircleIcon
        size={12}
        weight="fill"
        style={{ color: "var(--green-9)" }}
      />
    );
  }
  if (status === "failed") {
    return (
      <XCircleIcon size={12} weight="fill" style={{ color: "var(--red-9)" }} />
    );
  }
  return <CircleIcon size={12} style={{ color: "var(--gray-8)" }} />;
}

interface DiffStatsDisplayProps {
  worktreePath: string;
}

function DiffStatsDisplay({ worktreePath }: DiffStatsDisplayProps) {
  const { data: diffStats } = useQuery({
    queryKey: ["diff-stats", worktreePath],
    queryFn: () => window.electronAPI.getDiffStats(worktreePath),
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
      className="ml-auto flex shrink-0 bg-transparent text-[10px] text-gray-10"
      style={{ gap: "4px" }}
    >
      {parts}
    </span>
  );
}

export function TaskItem({
  label,
  status,
  isActive,
  worktreeName,
  worktreePath,
  workspaceMode,
  onClick,
  onContextMenu,
}: TaskItemProps) {
  const { data: currentBranch } = useCurrentBranch(worktreePath, worktreeName);

  const isCloudTask = workspaceMode === "cloud";
  const subtitle = isCloudTask ? (
    <span style={{ display: "flex", alignItems: "center", gap: "4px" }}>
      <Cloud size={10} />
      <span>Cloud</span>
    </span>
  ) : (
    (worktreeName ?? currentBranch)
  );

  return (
    <SidebarItem
      depth={0}
      icon={getStatusIcon(status)}
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
