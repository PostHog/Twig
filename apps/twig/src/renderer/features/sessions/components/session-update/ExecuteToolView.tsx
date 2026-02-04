import { Terminal } from "@phosphor-icons/react";
import { Box, Flex, Text } from "@radix-ui/themes";
import { useState } from "react";
import {
  ExpandableIcon,
  ExpandedContentBox,
  getContentText,
  StatusIndicators,
  type ToolViewProps,
  useToolCallStatus,
} from "./toolCallUtils";

const ANSI_REGEX = new RegExp(`${String.fromCharCode(0x1b)}\\[[0-9;]*m`, "g");

interface ExecuteRawInput {
  command?: string;
  description?: string;
}

export function ExecuteToolView({
  toolCall,
  turnCancelled,
  turnComplete,
}: ToolViewProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const { status, rawInput, content, title } = toolCall;
  const { isLoading, isFailed, wasCancelled } = useToolCallStatus(
    status,
    turnCancelled,
    turnComplete,
  );

  const executeInput = rawInput as ExecuteRawInput | undefined;
  const command = executeInput?.command ?? "";
  const description =
    executeInput?.description ?? (command ? undefined : title);

  const output = (getContentText(content) ?? "").replace(ANSI_REGEX, "");
  const hasOutput = output.trim().length > 0;
  const isExpandable = hasOutput;

  const handleClick = () => {
    if (isExpandable) {
      setIsExpanded(!isExpanded);
    }
  };

  return (
    <Box
      className={`group py-0.5 ${isExpandable ? "cursor-pointer" : ""}`}
      onClick={handleClick}
    >
      <Flex gap="2">
        <Box className="shrink-0 pt-px">
          <ExpandableIcon
            icon={Terminal}
            isLoading={isLoading}
            isExpandable={isExpandable}
            isExpanded={isExpanded}
          />
        </Box>
        <Text size="1" as="div">
          {description && <>{description} </>}
          <span className="font-mono text-accent-11">{command}</span>
          <StatusIndicators isFailed={isFailed} wasCancelled={wasCancelled} />
        </Text>
      </Flex>

      {isExpanded && hasOutput && (
        <ExpandedContentBox>{output}</ExpandedContentBox>
      )}
    </Box>
  );
}
