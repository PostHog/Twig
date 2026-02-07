import { Tooltip } from "@components/ui/Tooltip";
import type {
  GitMenuAction,
  GitMenuActionId,
} from "@features/git-interaction/hooks/useGitInteraction";
import {
  ArrowsClockwise,
  CloudArrowUp,
  Eye,
  GitBranch,
  GitCommit,
  GitPullRequest,
} from "@phosphor-icons/react";
import { ChevronDownIcon } from "@radix-ui/react-icons";
import { Button, DropdownMenu, Flex, Spinner, Text } from "@radix-ui/themes";

interface GitInteractionMenuProps {
  primaryAction: GitMenuAction;
  actions: GitMenuAction[];
  isBusy?: boolean;
  onPrimary: (actionId: GitMenuActionId) => void;
  onSelect: (actionId: GitMenuActionId) => void;
}

function ActionButton({
  action,
  isPrimary,
  isBusy,
  allDisabled,
  onClick,
}: {
  action: GitMenuAction;
  isPrimary: boolean;
  isBusy?: boolean;
  allDisabled?: boolean;
  onClick: () => void;
}) {
  const icon = getActionIcon(action.id);
  const isDisabled = !action.enabled || isBusy;
  const button = (
    <Button
      size="1"
      variant={allDisabled ? "soft" : "solid"}
      color={allDisabled ? "gray" : undefined}
      disabled={isDisabled}
      onClick={onClick}
      style={{
        borderTopRightRadius: isPrimary ? 0 : undefined,
        borderBottomRightRadius: isPrimary ? 0 : undefined,
      }}
    >
      <Flex align="center" gap="2">
        {isBusy ? <Spinner size="1" /> : icon}
        <Text size="1">{action.label}</Text>
      </Flex>
    </Button>
  );

  if (!action.enabled && action.disabledReason) {
    return (
      <Tooltip content={action.disabledReason} side="bottom">
        <span style={{ display: "inline-flex" }}>{button}</span>
      </Tooltip>
    );
  }

  return button;
}

function getActionIcon(actionId: GitMenuActionId) {
  switch (actionId) {
    case "commit":
      return <GitCommit size={12} weight="bold" />;
    case "push":
      return <CloudArrowUp size={12} weight="bold" />;
    case "sync":
      return <ArrowsClockwise size={12} weight="bold" />;
    case "publish":
      return <GitBranch size={12} weight="bold" />;
    case "create-pr":
      return <GitPullRequest size={12} weight="bold" />;
    case "view-pr":
      return <Eye size={12} weight="bold" />;
    default:
      return <CloudArrowUp size={12} weight="bold" />;
  }
}

export function GitInteractionMenu({
  primaryAction,
  actions,
  isBusy,
  onPrimary,
  onSelect,
}: GitInteractionMenuProps) {
  const allDisabled = actions.every((a) => !a.enabled);

  return (
    <Flex align="center" gap="0">
      <ActionButton
        action={primaryAction}
        isPrimary
        isBusy={isBusy}
        allDisabled={allDisabled}
        onClick={() => onPrimary(primaryAction.id)}
      />
      <DropdownMenu.Root>
        <DropdownMenu.Trigger>
          <Button
            size="1"
            variant={allDisabled ? "soft" : "solid"}
            color={allDisabled ? "gray" : undefined}
            disabled={isBusy}
            style={{
              borderTopLeftRadius: 0,
              borderBottomLeftRadius: 0,
              borderLeft: allDisabled ? undefined : "1px solid var(--accent-8)",
              paddingLeft: "6px",
              paddingRight: "6px",
            }}
          >
            <ChevronDownIcon />
          </Button>
        </DropdownMenu.Trigger>
        <DropdownMenu.Content size="1" align="end">
          {actions.map((action) => {
            const icon = getActionIcon(action.id);
            const itemContent = (
              <Flex align="center" gap="2">
                {icon}
                <Text size="1">{action.label}</Text>
              </Flex>
            );

            if (!action.enabled && action.disabledReason) {
              return (
                <Tooltip key={action.id} content={action.disabledReason}>
                  <DropdownMenu.Item disabled>{itemContent}</DropdownMenu.Item>
                </Tooltip>
              );
            }

            return (
              <DropdownMenu.Item
                key={action.id}
                onSelect={() => onSelect(action.id)}
              >
                {itemContent}
              </DropdownMenu.Item>
            );
          })}
        </DropdownMenu.Content>
      </DropdownMenu.Root>
    </Flex>
  );
}
