import {
  createGitActionMessage,
  type GitActionType,
} from "@features/sessions/components/GitActionMessage";
import { useSessionStore } from "@features/sessions/stores/sessionStore";
import {
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
import { useCallback, useState } from "react";

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
    default:
      return <CloudArrowUp size={14} weight="bold" />;
  }
}

const CREATE_PR_PROMPT =
  "Create a pull request for this branch with an appropriate title and description summarizing the changes.";

export function GitActionsBar({
  taskId,
  repoPath,
  hasChanges,
}: GitActionsBarProps) {
  const [isSending, setIsSending] = useState(false);
  const sendPrompt = useSessionStore((state) => state.sendPrompt);
  const session = useSessionStore((state) => state.getSessionForTask(taskId));

  const { smartAction, ahead, behind, hasRemote, isFetched } = useGitStatus({
    repoPath,
    hasChanges,
  });

  const handleAction = useCallback(
    async (actionType: GitActionType, prompt: string) => {
      if (!session || isSending) return;

      setIsSending(true);
      try {
        const message = createGitActionMessage(actionType, prompt);
        await sendPrompt(taskId, message);
      } catch (_error) {
      } finally {
        setIsSending(false);
      }
    },
    [taskId, session, sendPrompt, isSending],
  );

  const handlePrimaryAction = useCallback(() => {
    if (!smartAction) return;
    handleAction(smartAction, GIT_ACTION_PROMPTS[smartAction]);
  }, [smartAction, handleAction]);

  // Don't show if no session is active
  if (!session) {
    return null;
  }

  // Don't show until we've fetched git status at least once
  if (!isFetched) {
    return null;
  }

  // Don't show if no action is needed (everything is up to date)
  if (!smartAction) {
    return null;
  }

  // Build status text
  const statusParts: string[] = [];
  if (ahead > 0) {
    statusParts.push(`${ahead} ahead`);
  }
  if (behind > 0) {
    statusParts.push(`${behind} behind`);
  }
  const statusText = statusParts.length > 0 ? statusParts.join(", ") : null;

  const isDisabled = isSending || !smartAction;
  const buttonLabel = GIT_ACTION_LABELS[smartAction];

  // Get dropdown actions (all actions except current smart action)
  const dropdownActions = (
    Object.keys(GIT_ACTION_LABELS) as Exclude<SmartGitAction, null>[]
  ).filter((action) => action !== smartAction);

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
        {/* Status indicator */}
        {statusText && (
          <Text size="1" color="gray" style={{ flexShrink: 0 }}>
            {statusText}
          </Text>
        )}

        {/* Spacer */}
        <Box style={{ flex: 1 }} />

        {/* Primary action button with dropdown */}
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
              smartAction && getActionIcon(smartAction)
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
              {/* Other git actions */}
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

              {/* Create PR option - only if branch has a remote */}
              {hasRemote && (
                <>
                  <DropdownMenu.Separator />
                  <DropdownMenu.Item
                    onSelect={() => handleAction("create-pr", CREATE_PR_PROMPT)}
                  >
                    <Flex align="center" gap="2">
                      <GitPullRequest size={14} weight="regular" />
                      <Text size="1">Create Pull Request</Text>
                    </Flex>
                  </DropdownMenu.Item>
                </>
              )}
            </DropdownMenu.Content>
          </DropdownMenu.Root>
        </Flex>
      </Flex>
    </Box>
  );
}
