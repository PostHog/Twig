import { DotsCircleSpinner } from "@components/DotsCircleSpinner";
import type { ToolCall } from "@features/sessions/types";
import { usePendingPermissionsForTask } from "@features/sessions/stores/sessionStore";
import { CheckCircle, ClockCounterClockwise } from "@phosphor-icons/react";
import { Box, Flex, Text } from "@radix-ui/themes";
import { useMemo } from "react";
import ReactMarkdown from "react-markdown";

interface PlanApprovalViewProps {
  toolCall: ToolCall;
  taskId: string;
  turnCancelled?: boolean;
}

export function PlanApprovalView({
  toolCall,
  taskId,
  turnCancelled,
}: PlanApprovalViewProps) {
  const { toolCallId, status, content } = toolCall;
  const pendingPermissions = usePendingPermissionsForTask(taskId);

  const pendingPermission = pendingPermissions.get(toolCallId);
  const isComplete = status === "completed";
  const isPending = !!pendingPermission && !isComplete;
  const wasCancelled = (status === "pending" || status === "in_progress") && turnCancelled;

  // Extract plan text from content or rawInput
  const planText = useMemo(() => {
    // Try rawInput first (where Claude SDK puts the plan)
    const rawPlan = (toolCall.rawInput as { plan?: string } | undefined)?.plan;
    if (rawPlan) return rawPlan;

    // Fallback: check content array
    if (!content || content.length === 0) return null;
    const textContent = content.find((c) => c.type === "content");
    if (textContent && "content" in textContent) {
      const inner = textContent.content as { type?: string; text?: string } | undefined;
      if (inner?.type === "text" && inner.text) {
        return inner.text;
      }
    }
    return null;
  }, [content, toolCall.rawInput]);

  return (
    <Box className="my-3">
      {/* Plan content in highlighted box */}
      {planText && (
        <Box className="rounded-lg border-2 border-amber-6 bg-amber-2 p-4 mb-3">
          <Flex align="center" gap="2" className="mb-2">
            <Text size="2" weight="bold" className="text-amber-11">
              Implementation Plan
            </Text>
          </Flex>
          <Box className="prose prose-sm prose-invert max-w-none text-amber-12">
            <ReactMarkdown>{planText}</ReactMarkdown>
          </Box>
        </Box>
      )}

      {/* Status indicator */}
      <Flex align="center" gap="2" className="px-1">
        {isPending ? (
          <>
            <ClockCounterClockwise size={14} className="text-amber-9" />
            <Text size="1" className="text-amber-11">
              Waiting for approval — use the selector below to continue
            </Text>
          </>
        ) : isComplete ? (
          <>
            <CheckCircle size={14} weight="fill" className="text-green-9" />
            <Text size="1" className="text-green-11">
              Plan approved — proceeding with implementation
            </Text>
          </>
        ) : wasCancelled ? (
          <Text size="1" className="text-gray-9">
            (Cancelled)
          </Text>
        ) : (
          <>
            <DotsCircleSpinner size={14} className="text-gray-9" />
            <Text size="1" className="text-gray-9">
              Preparing plan...
            </Text>
          </>
        )}
      </Flex>
    </Box>
  );
}
