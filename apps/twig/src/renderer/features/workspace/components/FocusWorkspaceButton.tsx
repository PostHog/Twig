import { ArrowLeft, ArrowsClockwise, GitBranch } from "@phosphor-icons/react";
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

/** Check if branch is a twig-created branch (not borrowed) */
function isTwigBranch(branchName: string): boolean {
  return (
    branchName.startsWith("twig/") ||
    branchName.startsWith("array/") ||
    branchName.startsWith("posthog/")
  );
}

interface FocusWorkspaceButtonProps {
  taskId: string;
  repoPath?: string;
}

export function FocusWorkspaceButton({
  taskId,
  repoPath,
}: FocusWorkspaceButtonProps) {
  const workspace = useWorkspaceStore(selectWorkspace(taskId));

  const isLocalMode = workspace?.mode === "local" || !workspace?.mode;
  // Use repoPath prop if provided, fall back to workspace.folderPath
  const mainRepoPath = repoPath ?? workspace?.folderPath ?? "";

  const focusSession = useFocusStore((s) => s.session);
  const isFocusLoading = useFocusStore(selectIsLoading);
  const enableFocus = useFocusStore((s) => s.enableFocus);
  const disableFocus = useFocusStore((s) => s.disableFocus);

  const isFocused = useFocusStore(
    selectIsFocusedOnWorktree(workspace?.worktreePath ?? ""),
  );

  const isBackgrounded =
    isLocalMode && focusSession?.mainRepoPath === mainRepoPath;

  // Handler for local workspace unfocus (return to original branch)
  const handleLocalUnfocus = useCallback(async () => {
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

  const handleToggleFocus = useCallback(async () => {
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

    if (isFocused) {
      const hadStash = !!focusSession?.mainStashRef;
      const result = await disableFocus();
      if (result.success) {
        toast.success(
          <>
            Returned to{" "}
            <Text style={{ color: "var(--accent-11)" }}>
              {focusSession?.originalBranch}
            </Text>
          </>,
          {
            description:
              result.stashPopWarning ??
              (hadStash ? "Your stashed changes were restored." : undefined),
          },
        );
      } else {
        toast.error(`Could not return to ${focusSession?.originalBranch}`, {
          description: result.error,
        });
      }
    } else {
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
    }
  }, [workspace, isFocused, enableFocus, disableFocus, focusSession]);

  // Borrowed branches (like main) show "Switch to {branch}" instead of "Check out"
  const isBorrowedBranch =
    workspace?.branchName && !isTwigBranch(workspace.branchName);

  // For local workspaces that are backgrounded, show "Stop editing" button
  if (isLocalMode && isBackgrounded && focusSession) {
    return (
      <Tooltip
        content={`Your main repo has ${focusSession.branch} checked out. Click to return to ${focusSession.originalBranch}`}
      >
        <Button
          size="1"
          variant="outline"
          color="blue"
          onClick={handleLocalUnfocus}
          disabled={isFocusLoading}
          style={
            { flexShrink: 0, WebkitAppRegion: "no-drag" } as React.CSSProperties
          }
        >
          {isFocusLoading ? <Spinner size="1" /> : <ArrowLeft size={14} />}
          Return to {focusSession.originalBranch}
        </Button>
      </Tooltip>
    );
  }

  // Only show for worktree mode workspaces with a branch and worktree path
  // For borrowed branches, don't show when already focused (it's the normal state)
  if (
    !workspace ||
    workspace.mode !== "worktree" ||
    !workspace.branchName ||
    !workspace.worktreePath ||
    (isBorrowedBranch && isFocused)
  ) {
    return null;
  }

  const tooltipContent = isFocused
    ? `Your main repo has this branch. Click to return to ${focusSession?.originalBranch}`
    : isBorrowedBranch
      ? `Switch back to ${workspace.branchName} in your main repo`
      : "Check out in your main repo to edit locally";

  const buttonLabel = isFocused
    ? "Editing workspace"
    : isBorrowedBranch
      ? `Switch to ${workspace.branchName}`
      : "Edit workspace";

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
        ) : isBorrowedBranch ? (
          <ArrowsClockwise size={14} />
        ) : (
          <GitBranch size={14} weight={isFocused ? "fill" : "regular"} />
        )}
        {buttonLabel}
      </Button>
    </Tooltip>
  );
}
