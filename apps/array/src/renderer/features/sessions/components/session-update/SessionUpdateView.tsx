import type { SessionUpdate, ToolCall } from "@features/sessions/types";

import { AgentMessage } from "./AgentMessage";
import { ConsoleMessage } from "./ConsoleMessage";
import { CurrentModeView } from "./CurrentModeView";
import { PlanView } from "./PlanView";
import { ThoughtView } from "./ThoughtView";
import { ToolCallBlock } from "./ToolCallBlock";

export type RenderItem =
  | SessionUpdate
  | {
      sessionUpdate: "console";
      level: string;
      message: string;
      timestamp?: string;
    };

interface SessionUpdateViewProps {
  item: RenderItem;
  toolCalls?: Map<string, ToolCall>;
  turnCancelled?: boolean;
}

export function SessionUpdateView({
  item,
  toolCalls,
  turnCancelled,
}: SessionUpdateViewProps) {
  switch (item.sessionUpdate) {
    case "user_message_chunk":
      return null; // User messages rendered separately
    case "agent_message_chunk":
      return item.content.type === "text" ? (
        <AgentMessage content={item.content.text} />
      ) : null;
    case "agent_thought_chunk":
      return item.content.type === "text" ? (
        <ThoughtView content={item.content.text} />
      ) : null;
    case "tool_call":
      return (
        <ToolCallBlock
          toolCall={toolCalls?.get(item.toolCallId) ?? item}
          turnCancelled={turnCancelled}
        />
      );
    case "tool_call_update":
      return null; // Updates are merged into the original tool_call
    case "plan":
      return <PlanView plan={item} />;
    case "available_commands_update":
      return null;
    case "current_mode_update":
      return <CurrentModeView update={item} />;
    case "console":
      return (
        <ConsoleMessage
          level={item.level as "info" | "debug" | "warn" | "error"}
          message={item.message}
          timestamp={item.timestamp}
        />
      );
  }
}
