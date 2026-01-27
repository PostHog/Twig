import type { ToolCall } from "@features/sessions/types";
import { ExecuteToolView } from "./ExecuteToolView";
import { PlanApprovalView } from "./PlanApprovalView";
import { ToolCallView } from "./ToolCallView";

interface ToolCallBlockProps {
  toolCall: ToolCall;
  taskId?: string;
  turnCancelled?: boolean;
}

export function ToolCallBlock({
  toolCall,
  taskId,
  turnCancelled,
}: ToolCallBlockProps) {
  if (toolCall.kind === "switch_mode" && taskId) {
    return (
      <PlanApprovalView
        toolCall={toolCall}
        taskId={taskId}
        turnCancelled={turnCancelled}
      />
    );
  }

  if (toolCall.kind === "execute") {
    return (
      <ExecuteToolView toolCall={toolCall} turnCancelled={turnCancelled} />
    );
  }

  return <ToolCallView toolCall={toolCall} turnCancelled={turnCancelled} />;
}
