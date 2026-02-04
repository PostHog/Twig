import { MagnifyingGlass } from "@phosphor-icons/react";
import { Box, Flex, Text } from "@radix-ui/themes";
import { useState } from "react";
import { ToolRow } from "./ToolRow";
import {
  ExpandableIcon,
  ExpandedContentBox,
  getContentText,
  StatusIndicators,
  type ToolViewProps,
  useToolCallStatus,
} from "./toolCallUtils";

export function SearchToolView({
  toolCall,
  turnCancelled,
  turnComplete,
}: ToolViewProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const { status, content, title } = toolCall;
  const { isLoading, isFailed, wasCancelled } = useToolCallStatus(
    status,
    turnCancelled,
    turnComplete,
  );

  const searchResults = getContentText(content) ?? "";
  const hasResults = searchResults.trim().length > 0;
  const resultLines = hasResults
    ? searchResults.split("\n").filter((line) => line.trim().length > 0)
    : [];
  const resultCount = resultLines.length;

  if (!hasResults) {
    return (
      <ToolRow
        icon={MagnifyingGlass}
        isLoading={isLoading}
        isFailed={isFailed}
        wasCancelled={wasCancelled}
      >
        {title || "Search"}
      </ToolRow>
    );
  }

  const handleClick = () => {
    setIsExpanded(!isExpanded);
  };

  return (
    <Box>
      <Flex
        align="center"
        gap="2"
        className="group cursor-pointer py-0.5"
        onClick={handleClick}
      >
        <ExpandableIcon
          icon={MagnifyingGlass}
          isLoading={isLoading}
          isExpandable
          isExpanded={isExpanded}
        />
        <Text size="1">{title || "Search"}</Text>
        <Text size="1" color="gray">
          {resultCount} {resultCount === 1 ? "result" : "results"}
        </Text>
        <StatusIndicators isFailed={isFailed} wasCancelled={wasCancelled} />
      </Flex>

      {isExpanded && <ExpandedContentBox>{searchResults}</ExpandedContentBox>}
    </Box>
  );
}
