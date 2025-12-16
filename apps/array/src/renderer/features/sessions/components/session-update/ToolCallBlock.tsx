import type { ToolCall } from "@features/sessions/types";
import { ToolCallView } from "./ToolCallView";

interface ToolCallBlockProps {
  toolCall: ToolCall;
  turnCancelled?: boolean;
}

export function ToolCallBlock({ toolCall, turnCancelled }: ToolCallBlockProps) {
  return <ToolCallView toolCall={toolCall} turnCancelled={turnCancelled} />;
}
