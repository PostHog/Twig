import type {
  TerminalHandle,
  TerminalOutputResponse,
} from "@agentclientprotocol/sdk";
import type {
  Options,
  PermissionMode,
  Query,
  SDKUserMessage,
} from "@anthropic-ai/claude-agent-sdk";
import type { Pushable } from "@/utils/streams.js";
import type { BaseSession } from "../base-acp-agent.js";

export type Session = BaseSession & {
  query: Query;
  input: Pushable<SDKUserMessage>;
  permissionMode: PermissionMode;
  cwd: string;
  sdkSessionId?: string;
  lastPlanFilePath?: string;
  lastPlanContent?: string;
};

export type ToolUseCache = {
  [key: string]: {
    type: "tool_use" | "server_tool_use" | "mcp_tool_use";
    id: string;
    name: string;
    input: unknown;
  };
};

export type ToolUpdateMeta = {
  claudeCode?: {
    toolName: string;
    toolResponse?: unknown;
  };
};

export type NewSessionMeta = {
  claudeCode?: {
    options?: Options;
  };
  model?: string;
};

export type BackgroundTerminal =
  | {
      handle: TerminalHandle;
      status: "started";
      lastOutput: TerminalOutputResponse | null;
    }
  | {
      status: "aborted" | "exited" | "killed" | "timedOut";
      pendingOutput: TerminalOutputResponse;
    };
