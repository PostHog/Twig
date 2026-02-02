import { KeyHint } from "@components/ui/KeyHint";
import { Tooltip } from "@components/ui/Tooltip";
import { ArrowsClockwise, Play } from "@phosphor-icons/react";
import { Button, Flex, Spinner, Text } from "@radix-ui/themes";

interface FocusEmptyStateProps {
  displayPath: string;
  isFocusLoading: boolean;
  isDisabled: boolean;
  onFocus: () => void;
}

export function FocusEmptyState({
  displayPath,
  isFocusLoading,
  isDisabled,
  onFocus,
}: FocusEmptyStateProps) {
  return (
    <Flex
      direction="column"
      align="center"
      justify="center"
      height="100%"
      gap="3"
    >
      <ArrowsClockwise
        size={48}
        weight="light"
        style={{ color: "var(--gray-9)" }}
      />
      <Tooltip content={`Sync changes to ${displayPath}`} shortcut="⌘R">
        <Button
          size="1"
          variant="outline"
          color="gray"
          onClick={onFocus}
          disabled={isDisabled}
          style={{ color: "var(--gray-12)", gap: "var(--space-2)" }}
        >
          {isFocusLoading ? (
            <Spinner size="1" />
          ) : (
            <Play size={14} weight="fill" />
          )}
          Focus changes
          <KeyHint style={{ marginLeft: "var(--space-1)" }}>⌘R</KeyHint>
        </Button>
      </Tooltip>
      <Text size="1" style={{ color: "var(--gray-11)" }}>
        Synchronise your changes to {displayPath}
      </Text>
    </Flex>
  );
}
