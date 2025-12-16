import type { ToolCall } from "@features/sessions/types";
import { ExecuteToolView } from "./ExecuteToolView";
import { ToolCallView } from "./ToolCallView";

interface ToolCallBlockProps {
  toolCall: ToolCall;
  turnCancelled?: boolean;
}

export function ToolCallBlock({ toolCall, turnCancelled }: ToolCallBlockProps) {
  if (toolCall.kind === "execute") {
    return (
      <ExecuteToolView toolCall={toolCall} turnCancelled={turnCancelled} />
    );
  }
  return <ToolCallView toolCall={toolCall} turnCancelled={turnCancelled} />;
}
