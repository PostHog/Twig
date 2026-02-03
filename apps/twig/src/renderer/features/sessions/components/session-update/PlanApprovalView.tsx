import { PlanContent } from "@components/permissions/PlanContent";
import { CheckCircle } from "@phosphor-icons/react";
import { Box, Flex, Text } from "@radix-ui/themes";
import { useMemo } from "react";
import { type ToolViewProps, useToolCallStatus } from "./toolCallUtils";

export function PlanApprovalView({
  toolCall,
  turnCancelled,
  turnComplete,
}: ToolViewProps) {
  const { content } = toolCall;
  const { isComplete, wasCancelled } = useToolCallStatus(
    toolCall.status,
    turnCancelled,
    turnComplete,
  );

  const planText = useMemo(() => {
    const rawPlan = (toolCall.rawInput as { plan?: string } | undefined)?.plan;
    if (rawPlan) return rawPlan;

    if (!content || content.length === 0) return null;
    const textContent = content.find((c) => c.type === "content");
    if (textContent && "content" in textContent) {
      const inner = textContent.content as
        | { type?: string; text?: string }
        | undefined;
      if (inner?.type === "text" && inner.text) {
        return inner.text;
      }
    }
    return null;
  }, [content, toolCall.rawInput]);

  if (!isComplete && !wasCancelled) return null;

  return (
    <Box className="my-3">
      {planText && <PlanContent plan={planText} />}

      <Flex align="center" gap="2" className="mt-2 px-1">
        {isComplete ? (
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
        ) : null}
      </Flex>
    </Box>
  );
}
