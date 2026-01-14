import type {
  ToolKind as SdkToolKind,
  SessionNotification,
  ToolCallContent,
  ToolCallLocation,
  ToolCallStatus,
} from "@agentclientprotocol/sdk";

// Extend SDK ToolKind with custom kinds
export type ToolKind = SdkToolKind | "ask";

export type { ToolCallContent, ToolCallStatus, ToolCallLocation };

export interface ToolCall {
  _meta?: { [key: string]: unknown } | null;
  content?: ToolCallContent[];
  kind?: ToolKind | null;
  locations?: ToolCallLocation[];
  rawInput?: unknown;
  rawOutput?: unknown;
  status?: ToolCallStatus | null;
  title: string;
  toolCallId: string;
}

export type SessionUpdate = SessionNotification["update"];

export type Plan = Extract<SessionUpdate, { sessionUpdate: "plan" }>;
export type CurrentModeUpdate = Extract<
  SessionUpdate,
  { sessionUpdate: "current_mode_update" }
>;
