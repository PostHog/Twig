import type {
  ToolKind as AcpToolKind,
  SessionNotification,
  ToolCallContent,
  ToolCallLocation,
  ToolCallStatus,
} from "@agentclientprotocol/sdk";

export type TwigToolKind = AcpToolKind | "question";

export type { ToolCallContent, ToolCallStatus, ToolCallLocation };

export interface ToolCall {
  _meta?: { [key: string]: unknown } | null;
  content?: ToolCallContent[];
  kind?: TwigToolKind | null;
  locations?: ToolCallLocation[];
  rawInput?: unknown;
  rawOutput?: unknown;
  status?: ToolCallStatus | null;
  title: string;
  toolCallId: string;
}

export type SessionUpdate = SessionNotification["update"];

export type Plan = Extract<SessionUpdate, { sessionUpdate: "plan" }>;
export type ConfigOptionUpdate = Extract<
  SessionUpdate,
  { sessionUpdate: "config_option_update" }
>;
