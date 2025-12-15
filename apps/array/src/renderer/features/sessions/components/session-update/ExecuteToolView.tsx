import { DotsCircleSpinner } from "@components/DotsCircleSpinner";
import type { ToolCall } from "@features/sessions/types";
import { ArrowsInSimpleIcon, ArrowsOutSimpleIcon, Copy } from "@phosphor-icons/react";
import { Box, Flex, IconButton, Text } from "@radix-ui/themes";
import { useState } from "react";

interface ExecuteToolViewProps {
  toolCall: ToolCall;
  turnCancelled?: boolean;
}

interface ExecuteRawInput {
  command?: string;
  description?: string;
}

const COLLAPSED_LINE_COUNT = 3;

function getOutputFromContent(
  content: ToolCall["content"],
): string | undefined {
  if (!content?.length) return undefined;
  const first = content[0];
  if (first.type === "content" && first.content.type === "text") {
    return first.content.text;
  }
  return undefined;
}

export function ExecuteToolView({
  toolCall,
  turnCancelled,
}: ExecuteToolViewProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const { status, rawInput, content } = toolCall;
  const executeInput = rawInput as ExecuteRawInput | undefined;

  const command = executeInput?.command ?? "";
  const description = executeInput?.description;

  const isIncomplete = status === "pending" || status === "in_progress";
  const isLoading = isIncomplete && !turnCancelled;

  const output = getOutputFromContent(content) ?? "";
  const hasOutput = output.trim().length > 0;
  const outputLines = output.split("\n");
  const isCollapsible = outputLines.length > COLLAPSED_LINE_COUNT;
  const hiddenLineCount = outputLines.length - COLLAPSED_LINE_COUNT;
  const displayedOutput = isExpanded
    ? output
    : outputLines.slice(0, COLLAPSED_LINE_COUNT).join("\n");

  const handleCopy = () => {
    navigator.clipboard.writeText(command);
  };

  return (
    <Box className="my-2 max-w-4xl overflow-hidden rounded-lg border border-gray-6 bg-gray-1">
      {/* Header */}
      <Flex align="center" justify="between" className="px-3 py-2">
        <Flex align="center" gap="2">
          {isLoading && (
            <DotsCircleSpinner size={12} className="text-gray-10" />
          )}
          {description && (
            <Text size="1" className="text-gray-10">
              {description}
            </Text>
          )}
        </Flex>
        <Flex align="center" gap="2">
          {hasOutput && (
            <IconButton
              size="1"
              variant="ghost"
              color="gray"
              onClick={handleCopy}
            >
              <Copy size={12} />
            </IconButton>
          )}
          {isCollapsible && (
            <IconButton
              size="1"
              variant="ghost"
              color="gray"
              onClick={() => setIsExpanded(!isExpanded)}
            >
              {isExpanded ? (
                <ArrowsInSimpleIcon size={12} />
              ) : (
                <ArrowsOutSimpleIcon size={12} />
              )}
            </IconButton>
          )}
        </Flex>
      </Flex>

      {/* Command line */}
      <Box className="px-3 py-2">
        <Text asChild size="1" className="font-mono">
          <pre className="m-0 whitespace-pre-wrap break-all">
            <span className="text-accent-11">$</span>{" "}
            <span className="text-accent-11">{command}</span>
          </pre>
        </Text>
      </Box>

      {/* Output */}
      {hasOutput && (
        <Box className="border-gray-6 border-t px-3 py-2">
          <Text asChild size="1" className="font-mono text-gray-11">
            <pre className="m-0 whitespace-pre-wrap break-all">
              {displayedOutput}
            </pre>
          </Text>
          {/* Expand button at bottom */}
          {isCollapsible && !isExpanded && (
            <button
              type="button"
              onClick={() => setIsExpanded(true)}
              className="mt-1 flex cursor-pointer items-center gap-1 border-none bg-transparent p-0 text-gray-10 hover:text-gray-12"
            >
              <Text size="1">+{hiddenLineCount} more lines</Text>
            </button>
          )}
        </Box>
      )}
    </Box>
  );
}
