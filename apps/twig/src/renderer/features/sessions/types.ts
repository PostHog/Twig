import type {
  ToolKind as AcpToolKind,
  SessionNotification,
  ToolCallContent,
  ToolCallLocation,
  ToolCallStatus,
} from "@agentclientprotocol/sdk";
import type { TwigToolMeta } from "@posthog/agent/adapters/claude/tool-meta";

export type TwigToolKind = AcpToolKind | "question";

export type { ToolCallContent, ToolCallStatus, ToolCallLocation };
export type { TwigToolMeta };

export interface ToolCall {
  _meta?: TwigToolMeta | null;
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
export type CurrentModeUpdate = Extract<
  SessionUpdate,
  { sessionUpdate: "current_mode_update" }
>;
