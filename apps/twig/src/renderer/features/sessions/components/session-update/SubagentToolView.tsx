import type {
  ConversationItem,
  TurnContext,
} from "@features/sessions/components/buildConversationItems";
import {
  ArrowsInSimple as ArrowsInSimpleIcon,
  ArrowsOutSimple as ArrowsOutSimpleIcon,
  Brain,
} from "@phosphor-icons/react";
import { Box, Flex, IconButton, Text } from "@radix-ui/themes";
import { useEffect, useState } from "react";
import { SessionUpdateView } from "./SessionUpdateView";
import {
  LoadingIcon,
  StatusIndicators,
  type ToolViewProps,
  useToolCallStatus,
} from "./toolCallUtils";

interface SubagentToolViewProps extends ToolViewProps {
  childItems: ConversationItem[];
  turnContext: TurnContext;
}

export function SubagentToolView({
  toolCall,
  turnCancelled,
  turnComplete,
  childItems,
  turnContext,
}: SubagentToolViewProps) {
  const { title } = toolCall;
  const { isLoading, isFailed, wasCancelled, isComplete } = useToolCallStatus(
    toolCall.status,
    turnCancelled,
    turnComplete,
  );

  const [isExpanded, setIsExpanded] = useState(true);

  useEffect(() => {
    if (isComplete || isFailed || wasCancelled) {
      setIsExpanded(false);
    }
  }, [isComplete, isFailed, wasCancelled]);

  const hasChildren = childItems.length > 0;

  return (
    <Box className="my-2 max-w-4xl overflow-hidden rounded-lg border border-gray-6 bg-gray-1">
      <button
        type="button"
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex w-full cursor-pointer items-center justify-between border-none bg-transparent px-3 py-2"
      >
        <Flex align="center" gap="2">
          <LoadingIcon
            icon={Brain}
            isLoading={isLoading}
            className="text-gray-10"
          />
          <Text size="1" className="text-gray-10">
            {title || "Subagent"}
          </Text>
          <StatusIndicators isFailed={isFailed} wasCancelled={wasCancelled} />
        </Flex>
        {hasChildren && (
          <IconButton asChild size="1" variant="ghost" color="gray">
            <span>
              {isExpanded ? (
                <ArrowsInSimpleIcon size={12} />
              ) : (
                <ArrowsOutSimpleIcon size={12} />
              )}
            </span>
          </IconButton>
        )}
      </button>

      {isExpanded && hasChildren && (
        <Box className="space-y-1 border-gray-6 border-t px-2 py-2">
          {childItems.map((child) => {
            if (child.type !== "session_update") return null;
            return (
              <SessionUpdateView
                key={child.id}
                item={child.update}
                toolCalls={turnContext.toolCalls}
                childItems={turnContext.childItems}
                turnCancelled={turnContext.turnCancelled}
                turnComplete={turnContext.turnComplete}
              />
            );
          })}
        </Box>
      )}
    </Box>
  );
}
