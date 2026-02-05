import { FileText } from "@phosphor-icons/react";
import { Box, Flex } from "@radix-ui/themes";
import { useState } from "react";
import { CodePreview } from "./CodePreview";
import { FileMentionChip } from "./FileMentionChip";
import {
  ExpandableIcon,
  getReadToolContent,
  StatusIndicators,
  ToolTitle,
  type ToolViewProps,
  useToolCallStatus,
} from "./toolCallUtils";

export function ReadToolView({
  toolCall,
  turnCancelled,
  turnComplete,
}: ToolViewProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const { status, locations, content } = toolCall;
  const { isLoading, isFailed, wasCancelled } = useToolCallStatus(
    status,
    turnCancelled,
    turnComplete,
  );

  const filePath = locations?.[0]?.path ?? "";
  const startLine = locations?.[0]?.line ?? 0;
  const fileContent = getReadToolContent(content);
  const lineCount = fileContent ? fileContent.split("\n").length : null;
  const isExpandable = !!fileContent;
  const firstLineNumber = startLine + 1;

  const handleClick = () => {
    if (isExpandable) {
      setIsExpanded(!isExpanded);
    }
  };

  return (
    <Box>
      <Flex
        align="center"
        gap="2"
        className={`group py-0.5 ${isExpandable ? "cursor-pointer" : ""}`}
        onClick={handleClick}
      >
        <ExpandableIcon
          icon={FileText}
          isLoading={isLoading}
          isExpandable={isExpandable}
          isExpanded={isExpanded}
        />
        <ToolTitle>
          Read{lineCount !== null ? ` ${lineCount} lines in` : ""}
        </ToolTitle>
        {filePath && <FileMentionChip filePath={filePath} />}
        <StatusIndicators isFailed={isFailed} wasCancelled={wasCancelled} />
      </Flex>

      {isExpanded && fileContent && (
        <Box className="mt-2 ml-5">
          <Box className="max-w-4xl overflow-hidden rounded-lg border border-gray-6">
            <CodePreview
              content={fileContent}
              filePath={filePath}
              firstLineNumber={firstLineNumber}
            />
          </Box>
        </Box>
      )}
    </Box>
  );
}
