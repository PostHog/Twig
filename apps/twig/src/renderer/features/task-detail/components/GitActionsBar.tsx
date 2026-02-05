import {
  createGitActionMessage,
  type GitActionType,
} from "@features/sessions/components/GitActionMessage";
import { useSessionForTask } from "@features/sessions/stores/sessionStore";
import {
  GIT_ACTION_EXECUTION_TYPE,
  GIT_ACTION_LABELS,
  GIT_ACTION_PROMPTS,
  type SmartGitAction,
  useGitStatus,
} from "@features/task-detail/hooks/useGitStatus";
import {
  ArrowsClockwise,
  CloudArrowUp,
  GitBranch,
  GitPullRequest,
} from "@phosphor-icons/react";
import { ChevronDownIcon } from "@radix-ui/react-icons";
import {
  Box,
  Button,
  DropdownMenu,
  Flex,
  Spinner,
  Text,
} from "@radix-ui/themes";
import { track } from "@renderer/lib/analytics";
import { getSessionService } from "@renderer/services/session/service";
import { trpcVanilla } from "@renderer/trpc";
import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useState } from "react";
import {
  ANALYTICS_EVENTS,
  type GitActionType as AnalyticsGitActionType,
} from "@/types/analytics";

interface GitActionsBarProps {
  taskId: string;
  repoPath: string;
  hasChanges: boolean;
}

function getActionIcon(action: SmartGitAction) {
  switch (action) {
    case "commit-push":
      return <CloudArrowUp size={14} weight="bold" />;
    case "publish":
      return <GitBranch size={14} weight="bold" />;
    case "push":
      return <CloudArrowUp size={14} weight="bold" />;
    case "pull":
      return <ArrowsClockwise size={14} weight="bold" />;
    case "sync":
      return <ArrowsClockwise size={14} weight="bold" />;
    case "create-pr":
      return <GitPullRequest size={14} weight="bold" />;
    default:
      return <CloudArrowUp size={14} weight="bold" />;
  }
}

// Execute simple git operations directly via tRPC (no agent needed)
async function executeTrpcGitAction(
  actionType: GitActionType,
  repoPath: string,
): Promise<{ success: boolean; message: string }> {
  switch (actionType) {
    case "push": {
      const result = await trpcVanilla.git.push.mutate({
        directoryPath: repoPath,
      });
      return result;
    }
    case "pull": {
      const result = await trpcVanilla.git.pull.mutate({
        directoryPath: repoPath,
      });
      return { success: result.success, message: result.message };
    }
    case "publish": {
      const result = await trpcVanilla.git.publish.mutate({
        directoryPath: repoPath,
      });
      return { success: result.success, message: result.message };
    }
    case "sync": {
      const result = await trpcVanilla.git.sync.mutate({
        directoryPath: repoPath,
      });
      return {
        success: result.success,
        message: result.success
          ? "Synced successfully"
          : `Pull: ${result.pullMessage}, Push: ${result.pushMessage}`,
      };
    }
    default:
      throw new Error(`Unknown tRPC git action: ${actionType}`);
  }
}

export function GitActionsBar({
  taskId,
  repoPath,
  hasChanges,
}: GitActionsBarProps) {
  const [isSending, setIsSending] = useState(false);
  const session = useSessionForTask(taskId);
  const queryClient = useQueryClient();

  const { smartAction, ahead, behind, isFetched } = useGitStatus({
    repoPath,
    hasChanges,
    enabled: true,
  });

  const effectiveAction: SmartGitAction = smartAction;

  const handleAction = useCallback(
    async (actionType: GitActionType, prompt: string) => {
      if (isSending) return;

      const executionType = GIT_ACTION_EXECUTION_TYPE[actionType];

      setIsSending(true);
      let success = false;
      try {
        if (executionType === "trpc") {
          const result = await executeTrpcGitAction(actionType, repoPath);
          success = result.success;
          await queryClient.invalidateQueries({
            queryKey: ["git-sync-status", repoPath],
          });
          await queryClient.invalidateQueries({
            queryKey: ["changed-files-head", repoPath],
          });
        } else {
          if (!session) return;
          const message = createGitActionMessage(actionType, prompt);
          await getSessionService().sendPrompt(taskId, message);
          success = true;
        }

        // Track git action executed
        track(ANALYTICS_EVENTS.GIT_ACTION_EXECUTED, {
          action_type: actionType as AnalyticsGitActionType,
          success,
          task_id: taskId,
        });

        // Track PR created specifically
        if (actionType === "create-pr") {
          track(ANALYTICS_EVENTS.PR_CREATED, {
            task_id: taskId,
            success,
          });
        }
      } catch (_error) {
        // Track failed git action
        track(ANALYTICS_EVENTS.GIT_ACTION_EXECUTED, {
          action_type: actionType as AnalyticsGitActionType,
          success: false,
          task_id: taskId,
        });
      } finally {
        setIsSending(false);
      }
    },
    [taskId, session, isSending, repoPath, queryClient],
  );

  const handlePrimaryAction = useCallback(() => {
    if (!effectiveAction) return;
    handleAction(effectiveAction, GIT_ACTION_PROMPTS[effectiveAction]);
  }, [effectiveAction, handleAction]);

  if (!session) {
    return null;
  }

  if (!isFetched) {
    return null;
  }

  if (!smartAction) {
    return null;
  }

  const statusParts: string[] = [];
  if (ahead > 0) {
    statusParts.push(`${ahead} ahead`);
  }
  if (behind > 0) {
    statusParts.push(`${behind} behind`);
  }
  const statusText = statusParts.length > 0 ? statusParts.join(", ") : null;

  const isDisabled = isSending || !effectiveAction;
  const buttonLabel = effectiveAction ? GIT_ACTION_LABELS[effectiveAction] : "";

  const dropdownActions = (
    Object.keys(GIT_ACTION_LABELS) as Exclude<SmartGitAction, null>[]
  ).filter((action) => action !== effectiveAction);

  return (
    <Box
      style={{
        position: "absolute",
        bottom: 0,
        left: 0,
        right: 0,
        borderTop: "1px solid var(--gray-6)",
        background: "var(--color-background)",
        padding: "8px 12px",
      }}
    >
      <Flex align="center" gap="2" justify="between">
        {statusText && (
          <Text size="1" color="gray" style={{ flexShrink: 0 }}>
            {statusText}
          </Text>
        )}

        <Box style={{ flex: 1 }} />

        <Flex align="center" gap="0">
          <Button
            size="1"
            variant="solid"
            disabled={isDisabled}
            onClick={handlePrimaryAction}
            style={{
              borderTopRightRadius: 0,
              borderBottomRightRadius: 0,
            }}
          >
            {isSending ? (
              <Spinner size="1" />
            ) : (
              effectiveAction && getActionIcon(effectiveAction)
            )}
            {buttonLabel}
          </Button>

          <DropdownMenu.Root>
            <DropdownMenu.Trigger>
              <Button
                size="1"
                variant="solid"
                disabled={isSending}
                style={{
                  borderTopLeftRadius: 0,
                  borderBottomLeftRadius: 0,
                  borderLeft: "1px solid var(--accent-8)",
                  paddingLeft: "6px",
                  paddingRight: "6px",
                }}
              >
                <ChevronDownIcon />
              </Button>
            </DropdownMenu.Trigger>

            <DropdownMenu.Content size="1" align="end">
              {dropdownActions.map((action) => (
                <DropdownMenu.Item
                  key={action}
                  onSelect={() =>
                    handleAction(action, GIT_ACTION_PROMPTS[action])
                  }
                >
                  <Flex align="center" gap="2">
                    {getActionIcon(action)}
                    <Text size="1">{GIT_ACTION_LABELS[action]}</Text>
                  </Flex>
                </DropdownMenu.Item>
              ))}
            </DropdownMenu.Content>
          </DropdownMenu.Root>
        </Flex>
      </Flex>
    </Box>
  );
}
