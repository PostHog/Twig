import { Tooltip } from "@components/ui/Tooltip";
import { ArrowLeft, Play, Stop } from "@phosphor-icons/react";
import { Button, Spinner } from "@radix-ui/themes";
import { compactHomePath } from "@utils/path";
import { useFocusWorkspace } from "../hooks/useFocusWorkspace";

interface FocusWorkspaceButtonProps {
  taskId: string;
}

export function FocusWorkspaceButton({ taskId }: FocusWorkspaceButtonProps) {
  const {
    workspace,
    focusSession,
    isFocusLoading,
    isFocused,
    handleUnfocus,
    handleToggleFocus,
  } = useFocusWorkspace(taskId);

  if (!workspace) return null;

  const isLocalMode = workspace.mode === "local";
  const isWorktreeMode = workspace.mode === "worktree";
  const isBackgrounded =
    isLocalMode &&
    focusSession &&
    focusSession.mainRepoPath === workspace.folderPath;

  if (isLocalMode && isBackgrounded && focusSession) {
    const isTruncated = focusSession.originalBranch.length > 25;
    const truncatedOriginal = isTruncated
      ? `${focusSession.originalBranch.slice(0, 25)}...`
      : focusSession.originalBranch;

    const button = (
      <Button
        size="1"
        variant="outline"
        color="blue"
        onClick={handleUnfocus}
        disabled={isFocusLoading}
        style={
          {
            flexShrink: 0,
            WebkitAppRegion: "no-drag",
            marginLeft: "var(--space-2)",
          } as React.CSSProperties
        }
      >
        {isFocusLoading ? <Spinner size="1" /> : <ArrowLeft size={14} />}
        Return to {truncatedOriginal}
      </Button>
    );

    if (isTruncated) {
      return (
        <Tooltip content={`Return to ${focusSession.originalBranch}`}>
          <span style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}>
            {button}
          </span>
        </Tooltip>
      );
    }

    return button;
  }

  if (!isWorktreeMode || !workspace.branchName || !workspace.worktreePath) {
    return null;
  }

  const displayPath = compactHomePath(workspace.folderPath);
  const tooltipContent = isFocused
    ? `Stop syncing changes to ${displayPath}`
    : `Sync changes to ${displayPath}`;

  return (
    <Tooltip content={tooltipContent} shortcut="⌘R">
      <Button
        size="1"
        variant="outline"
        color="gray"
        onClick={handleToggleFocus}
        disabled={isFocusLoading}
        style={
          {
            flexShrink: 0,
            WebkitAppRegion: "no-drag",
            color: "var(--gray-12)",
          } as React.CSSProperties
        }
      >
        {isFocusLoading ? (
          <Spinner size="1" />
        ) : isFocused ? (
          <Stop size={14} weight="fill" />
        ) : (
          <Play size={14} weight="fill" />
        )}
        {isFocused ? "Stop" : "Focus"}
      </Button>
    </Tooltip>
  );
}
