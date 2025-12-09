// Simplified types for Max conversation in mobile app
// Based on posthog/frontend/src/queries/schema/schema-assistant-messages.ts

export enum AssistantMessageType {
  Human = "human",
  Assistant = "ai",
  Failure = "ai/failure",
  ToolCall = "ai/tool_call",
}

export enum AssistantEventType {
  Status = "status",
  Message = "message",
  Conversation = "conversation",
}

export enum AssistantGenerationStatusType {
  Acknowledged = "ack",
  GenerationError = "generation_error",
}

export interface BaseAssistantMessage {
  id?: string;
}

export interface HumanMessage extends BaseAssistantMessage {
  type: AssistantMessageType.Human;
  content: string;
}

export interface AssistantMessage extends BaseAssistantMessage {
  type: AssistantMessageType.Assistant;
  content: string;
  meta?: {
    thinking?: Array<{ type: string; thinking: string }>;
  };
}

export interface FailureMessage extends BaseAssistantMessage {
  type: AssistantMessageType.Failure;
  content?: string;
}

export type ToolCallStatus = "pending" | "running" | "completed" | "error";

export interface ToolCallMessage extends BaseAssistantMessage {
  type: AssistantMessageType.ToolCall;
  toolName: string;
  toolCallId: string;
  status: ToolCallStatus;
  args?: Record<string, unknown>;
  result?: unknown;
}

export type RootAssistantMessage =
  | HumanMessage
  | AssistantMessage
  | FailureMessage
  | ToolCallMessage;

export type MessageStatus = "loading" | "completed" | "error";

export type ThreadMessage = RootAssistantMessage & {
  status: MessageStatus;
};

export interface Conversation {
  id: string;
  title?: string | null;
  created_at: string;
  updated_at: string;
  status: ConversationStatus;
}

export enum ConversationStatus {
  Idle = "idle",
  InProgress = "in_progress",
}

export interface AssistantGenerationStatusEvent {
  type: AssistantGenerationStatusType;
}

// Helper type guards
export function isHumanMessage(
  message: RootAssistantMessage,
): message is HumanMessage {
  return message.type === AssistantMessageType.Human;
}

export function isAssistantMessage(
  message: RootAssistantMessage,
): message is AssistantMessage {
  return message.type === AssistantMessageType.Assistant;
}

export function isFailureMessage(
  message: RootAssistantMessage,
): message is FailureMessage {
  return message.type === AssistantMessageType.Failure;
}

export function isToolCallMessage(
  message: RootAssistantMessage,
): message is ToolCallMessage {
  return message.type === AssistantMessageType.ToolCall;
}
