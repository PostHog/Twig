import type { ToolCall } from "@features/sessions/types";
import { EditToolView } from "./EditToolView";
import { ExecuteToolView } from "./ExecuteToolView";
import { InlineQuestionView } from "./InlineQuestionView";
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
  // Route to specialized views for interactive tools
  if (toolCall.kind === "ask" && taskId) {
    return (
      <InlineQuestionView
        toolCall={toolCall}
        taskId={taskId}
        turnCancelled={turnCancelled}
      />
    );
  }

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

  if (toolCall.kind === "edit") {
    return <EditToolView toolCall={toolCall} turnCancelled={turnCancelled} />;
  }

  return <ToolCallView toolCall={toolCall} turnCancelled={turnCancelled} />;
}
