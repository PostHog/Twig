import { ArrowLeft, GitBranch } from "@phosphor-icons/react";
import { Button, Spinner, Text, Tooltip } from "@radix-ui/themes";
import {
  selectIsFocusedOnWorktree,
  selectIsLoading,
  useFocusStore,
} from "@stores/focusStore";
import { showFocusSuccessToast } from "@utils/focusToast";
import { toast } from "@utils/toast";
import { useCallback } from "react";
import { selectWorkspace, useWorkspaceStore } from "../stores/workspaceStore";

interface FocusWorkspaceButtonProps {
  taskId: string;
}

export function FocusWorkspaceButton({ taskId }: FocusWorkspaceButtonProps) {
  const workspace = useWorkspaceStore(selectWorkspace(taskId));
  const focusSession = useFocusStore((s) => s.session);
  const isFocusLoading = useFocusStore(selectIsLoading);
  const enableFocus = useFocusStore((s) => s.enableFocus);
  const disableFocus = useFocusStore((s) => s.disableFocus);

  const isFocused = useFocusStore(
    selectIsFocusedOnWorktree(workspace?.worktreePath ?? ""),
  );

  const handleUnfocus = useCallback(async () => {
    if (!focusSession) {
      toast.error("Could not return to original branch", {
        description: "No focused workspace found",
      });
      return;
    }

    const hadStash = !!focusSession.mainStashRef;
    const result = await disableFocus();
    if (result.success) {
      toast.success(
        <>
          Returned to{" "}
          <Text style={{ color: "var(--accent-11)" }}>
            {focusSession.originalBranch}
          </Text>
        </>,
        {
          description:
            result.stashPopWarning ??
            (hadStash ? "Your stashed changes were restored." : undefined),
        },
      );
    } else {
      toast.error(`Could not return to ${focusSession.originalBranch}`, {
        description: result.error,
      });
    }
  }, [focusSession, disableFocus]);

  const handleFocus = useCallback(async () => {
    if (!workspace) return;

    if (
      workspace.mode !== "worktree" ||
      !workspace.branchName ||
      !workspace.worktreePath
    ) {
      toast.error("Could not edit workspace", {
        description: "Only worktree-mode workspaces can be edited",
      });
      return;
    }

    const result = await enableFocus({
      mainRepoPath: workspace.folderPath,
      worktreePath: workspace.worktreePath,
      branch: workspace.branchName,
    });

    if (result.success) {
      showFocusSuccessToast(workspace.branchName, result);
    } else {
      toast.error("Could not edit workspace", {
        description: result.error,
      });
    }
  }, [workspace, enableFocus]);

  const handleToggleFocus = isFocused ? handleUnfocus : handleFocus;

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

  const tooltipContent = isFocused
    ? `Your main repo has this branch. Click to return to ${focusSession?.originalBranch}`
    : "Check out in your main repo to edit locally";

  const buttonLabel = isFocused ? "Editing workspace" : "Edit workspace";

  return (
    <Tooltip content={tooltipContent}>
      <Button
        size="1"
        variant={isFocused ? "solid" : "outline"}
        color="blue"
        onClick={handleToggleFocus}
        disabled={isFocusLoading}
        style={
          {
            flexShrink: 0,
            WebkitAppRegion: "no-drag",
            marginLeft: "var(--space-2)",
          } as React.CSSProperties
        }
      >
        {isFocusLoading ? (
          <Spinner size="1" />
        ) : (
          <GitBranch size={14} weight={isFocused ? "fill" : "regular"} />
        )}
        {buttonLabel}
      </Button>
    </Tooltip>
  );
}
