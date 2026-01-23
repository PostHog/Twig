import type { SessionUpdate, ToolCall } from "@features/sessions/types";

import { AgentMessage } from "./AgentMessage";
import { CompactBoundaryView } from "./CompactBoundaryView";
import { ConsoleMessage } from "./ConsoleMessage";
import { CurrentModeView } from "./CurrentModeView";
import { ErrorNotificationView } from "./ErrorNotificationView";
import { StatusNotificationView } from "./StatusNotificationView";
import { TaskNotificationView } from "./TaskNotificationView";
import { ThoughtView } from "./ThoughtView";
import { ToolCallBlock } from "./ToolCallBlock";

export type RenderItem =
  | SessionUpdate
  | {
      sessionUpdate: "console";
      level: string;
      message: string;
      timestamp?: string;
    }
  | {
      sessionUpdate: "compact_boundary";
      trigger: "manual" | "auto";
      preTokens: number;
    }
  | {
      sessionUpdate: "status";
      status: string;
      isComplete?: boolean;
    }
  | {
      sessionUpdate: "error";
      errorType: string;
      message: string;
    }
  | {
      sessionUpdate: "task_notification";
      taskId: string;
      status: "completed" | "failed" | "stopped";
      summary: string;
      outputFile: string;
    };

interface SessionUpdateViewProps {
  item: RenderItem;
  toolCalls?: Map<string, ToolCall>;
  taskId?: string;
  turnCancelled?: boolean;
}

export function SessionUpdateView({
  item,
  toolCalls,
  taskId,
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
          taskId={taskId}
          turnCancelled={turnCancelled}
        />
      );
    case "tool_call_update":
      return null; // Updates are merged into the original tool_call
    case "plan":
      return null; // Plan shown in PlanStatusBar above message input
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
    case "compact_boundary":
      return (
        <CompactBoundaryView
          trigger={item.trigger}
          preTokens={item.preTokens}
        />
      );
    case "status":
      return (
        <StatusNotificationView
          status={item.status}
          isComplete={item.isComplete}
        />
      );
    case "error":
      return (
        <ErrorNotificationView
          errorType={item.errorType}
          message={item.message}
        />
      );
    case "task_notification":
      return (
        <TaskNotificationView status={item.status} summary={item.summary} />
      );
    default:
      return null;
  }
}
