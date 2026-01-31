import type { ToolCall } from "@features/sessions/types";
import { ExecuteToolView } from "./ExecuteToolView";
import { PlanApprovalView } from "./PlanApprovalView";
import { ToolCallView } from "./ToolCallView";

interface ToolCallBlockProps {
  toolCall: ToolCall;
  turnCancelled?: boolean;
  turnComplete?: boolean;
}

export function ToolCallBlock({
  toolCall,
  turnCancelled,
  turnComplete,
}: ToolCallBlockProps) {
  const meta = toolCall._meta as
    | { claudeCode?: { toolName?: string } }
    | undefined;
  const toolName = meta?.claudeCode?.toolName;

  if (toolCall.kind === "switch_mode") {
    return (
      <PlanApprovalView
        toolCall={toolCall}
        turnCancelled={turnCancelled}
        turnComplete={turnComplete}
      />
    );
  }

  if (toolName === "EnterPlanMode" || toolName === "ExitPlanMode") {
    return null;
  }

  if (toolCall.kind === "execute") {
    return (
      <ExecuteToolView
        toolCall={toolCall}
        turnCancelled={turnCancelled}
        turnComplete={turnComplete}
      />
    );
  }

  return (
    <ToolCallView
      toolCall={toolCall}
      turnCancelled={turnCancelled}
      turnComplete={turnComplete}
    />
  );
}
