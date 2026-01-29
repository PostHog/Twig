import type {
  TerminalHandle,
  TerminalOutputResponse,
} from "@agentclientprotocol/sdk";
import type {
  Options,
  Query,
  SDKUserMessage,
} from "@anthropic-ai/claude-agent-sdk";
import type { Pushable } from "@/utils/streams.js";
import type { BaseSession } from "../base-acp-agent.js";
import type { TwigExecutionMode } from "./tools.js";

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

export type Session = BaseSession & {
  query: Query;
  input: Pushable<SDKUserMessage>;
  permissionMode: TwigExecutionMode;
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

export type NewSessionMeta = {
  sessionId?: string;
  initialModeId?: string;
  disableBuiltInTools?: boolean;
  systemPrompt?: unknown;
  sdkSessionId?: string;
  model?: string;
  claudeCode?: {
    options?: Options;
  };
};
