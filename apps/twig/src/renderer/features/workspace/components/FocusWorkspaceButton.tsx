import { CrosshairIcon, CrosshairSimpleIcon } from "@phosphor-icons/react";
import { Button, Spinner, Text, Tooltip } from "@radix-ui/themes";
import { trpcReact } from "@renderer/trpc";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "@utils/toast";
import { useCallback } from "react";
import { selectWorkspace, useWorkspaceStore } from "../stores/workspaceStore";

interface FocusWorkspaceButtonProps {
  taskId: string;
}

export function FocusWorkspaceButton({ taskId }: FocusWorkspaceButtonProps) {
  const workspace = useWorkspaceStore(selectWorkspace(taskId));
  const utils = trpcReact.useUtils();
  const queryClient = useQueryClient();

  // Query current branch of main repo - this is the source of truth
  const { data: currentBranch, isLoading: isBranchLoading } =
    trpcReact.git.getCurrentBranch.useQuery(
      { directoryPath: workspace?.folderPath ?? "" },
      { enabled: !!workspace?.folderPath },
    );

  const enableFocus = trpcReact.focus.enable.useMutation({
    onSuccess: (result) => {
      utils.git.getCurrentBranch.invalidate();
      queryClient.invalidateQueries({ queryKey: ["main-repo-branch"] });
      if (result.success) {
        toast.success(
          <>
            Switched to{" "}
            <Text style={{ color: "var(--accent-11)" }}>
              {workspace?.branchName}
            </Text>
          </>,
          {
            description: result.stashed
              ? "Your uncommitted changes were stashed. Unfocus to restore them."
              : undefined,
          },
        );
      } else {
        toast.error("Could not focus workspace", {
          description: result.error,
        });
      }
    },
    onError: (error) => {
      toast.error("Could not focus workspace", {
        description: error.message,
      });
    },
  });

  const disableFocus = trpcReact.focus.disable.useMutation({
    onSuccess: (result) => {
      utils.git.getCurrentBranch.invalidate();
      queryClient.invalidateQueries({ queryKey: ["main-repo-branch"] });
      if (result.success) {
        toast.success(
          <>
            Switched to{" "}
            <Text style={{ color: "var(--accent-11)" }}>
              {result.returnedToBranch}
            </Text>
          </>,
          {
            description: result.error, // stash pop warning if any
          },
        );
      } else {
        toast.error("Could not unfocus workspace", {
          description: result.error,
        });
      }
    },
    onError: (error) => {
      toast.error("Could not unfocus workspace", {
        description: error.message,
      });
    },
  });

  // Focused = main repo is on this workspace's branch
  const isFocused = currentBranch === workspace?.branchName;

  const handleToggleFocus = useCallback(() => {
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
      disableFocus.mutate({
        mainRepoPath: workspace.folderPath,
        worktreePath: workspace.worktreePath,
        branch: workspace.branchName,
      });
    } else {
      enableFocus.mutate({
        workspaceId: taskId,
        mainRepoPath: workspace.folderPath,
        worktreePath: workspace.worktreePath,
        branch: workspace.branchName,
      });
    }
  }, [workspace, isFocused, taskId, enableFocus, disableFocus]);

  // Only show for worktree mode workspaces with a branch and worktree path
  if (
    !workspace ||
    workspace.mode !== "worktree" ||
    !workspace.branchName ||
    !workspace.worktreePath
  ) {
    return null;
  }

  const isLoading =
    isBranchLoading || enableFocus.isPending || disableFocus.isPending;
  const tooltipContent = isFocused
    ? "Unfocus workspace (return to original branch)"
    : "Focus workspace (checkout branch in main repo)";

  return (
    <Tooltip content={tooltipContent}>
      <Button
        size="1"
        variant={isFocused ? "solid" : "soft"}
        color={isFocused ? "blue" : undefined}
        onClick={handleToggleFocus}
        disabled={isLoading}
        style={
          { flexShrink: 0, WebkitAppRegion: "no-drag" } as React.CSSProperties
        }
      >
        {isLoading ? (
          <Spinner size="1" />
        ) : isFocused ? (
          <CrosshairIcon size={14} weight="fill" />
        ) : (
          <CrosshairSimpleIcon size={14} />
        )}
        {isFocused ? "Watching" : "Watch"}
      </Button>
    </Tooltip>
  );
}
