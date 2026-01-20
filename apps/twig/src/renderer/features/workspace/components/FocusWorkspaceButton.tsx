import {
  ArrowLeft,
  ArrowsClockwise,
  CrosshairIcon,
  CrosshairSimpleIcon,
} from "@phosphor-icons/react";
import { Button, Spinner, Text, Tooltip } from "@radix-ui/themes";
import {
  selectIsFocusedOnWorktree,
  selectIsLoading,
  useFocusStore,
} from "@stores/focusStore";
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
      toast.error("Cannot return to original branch", {
        description: "No focused workspace found",
      });
      return;
    }

    const result = await disableFocus();
    if (result.success) {
      toast.success(
        <>
          Switched to{" "}
          <Text style={{ color: "var(--accent-11)" }}>
            {focusSession.originalBranch}
          </Text>
        </>,
        {
          description: result.stashPopWarning,
        },
      );
    } else {
      toast.error("Could not unfocus workspace", {
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
      toast.error("Cannot focus workspace", {
        description: "Only worktree-mode workspaces can be focused",
      });
      return;
    }

    if (isFocused) {
      const result = await disableFocus();
      if (result.success) {
        toast.success(
          <>
            Switched to{" "}
            <Text style={{ color: "var(--accent-11)" }}>
              {focusSession?.originalBranch}
            </Text>
          </>,
          {
            description: result.stashPopWarning,
          },
        );
      } else {
        toast.error("Could not unfocus workspace", {
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
        toast.success(
          <>
            Switched to{" "}
            <Text style={{ color: "var(--accent-11)" }}>
              {workspace.branchName}
            </Text>
          </>,
          {
            description: focusSession?.mainStashRef
              ? "Your uncommitted changes were stashed. Unfocus to restore them."
              : undefined,
          },
        );
      } else {
        toast.error("Could not focus workspace", {
          description: result.error,
        });
      }
    }
  }, [workspace, isFocused, enableFocus, disableFocus, focusSession]);

  // Borrowed branches (like main) show "Switch to {branch}" instead of "Watch"
  const isBorrowedBranch =
    workspace?.branchName && !isTwigBranch(workspace.branchName);

  // For local workspaces that are backgrounded, show "Return to {branch}" button
  if (isLocalMode && isBackgrounded && focusSession) {
    return (
      <Tooltip
        content={`Return to ${focusSession.originalBranch} and unfocus the current task`}
      >
        <Button
          size="1"
          variant="outline"
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
    ? "Unfocus workspace (return to original branch)"
    : isBorrowedBranch
      ? `This task was moved to a worktree when you switched branches. Click to switch back to "${workspace.branchName}".`
      : "Focus workspace (checkout branch in main repo)";

  const buttonLabel = isFocused
    ? "Watching"
    : isBorrowedBranch
      ? `Switch to ${workspace.branchName}`
      : "Watch";

  return (
    <Tooltip content={tooltipContent}>
      <Button
        size="1"
        variant={isFocused ? "solid" : "soft"}
        color={isFocused ? "blue" : undefined}
        onClick={handleToggleFocus}
        disabled={isFocusLoading}
        style={
          { flexShrink: 0, WebkitAppRegion: "no-drag" } as React.CSSProperties
        }
      >
        {isFocusLoading ? (
          <Spinner size="1" />
        ) : isFocused ? (
          <CrosshairIcon size={14} weight="fill" />
        ) : isBorrowedBranch ? (
          <ArrowsClockwise size={14} />
        ) : (
          <CrosshairSimpleIcon size={14} />
        )}
        {buttonLabel}
      </Button>
    </Tooltip>
  );
}
