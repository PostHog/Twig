import type {
  AgentSideConnection,
  SessionNotification,
} from "@agentclientprotocol/sdk";
import type { SDKPartialAssistantMessage } from "@anthropic-ai/claude-agent-sdk";
import type { ContentBlockParam } from "@anthropic-ai/sdk/resources";
import type {
  BetaContentBlock,
  BetaRawContentBlockDelta,
} from "@anthropic-ai/sdk/resources/beta.mjs";
import type { Logger } from "@/utils/logger.js";
import { registerHookCallback } from "./hooks.js";
import {
  type ClaudePlanEntry,
  planEntries,
  toolInfoFromToolUse,
  toolUpdateFromToolResult,
} from "./tool-metadata.js";
import type { ToolUpdateMeta, ToolUseCache } from "./types.js";
import { unreachable } from "./utils.js";

type ContentChunk =
  | ContentBlockParam
  | BetaContentBlock
  | BetaRawContentBlockDelta;

type ChunkHandlerContext = {
  sessionId: string;
  toolUseCache: ToolUseCache;
  fileContentCache: { [key: string]: string };
  client: AgentSideConnection;
  logger: Logger;
};

function messageUpdateType(role: "assistant" | "user") {
  return role === "assistant" ? "agent_message_chunk" : "user_message_chunk";
}

function toolMeta(toolName: string, toolResponse?: unknown): ToolUpdateMeta {
  return toolResponse
    ? { claudeCode: { toolName, toolResponse } }
    : { claudeCode: { toolName } };
}

function handleTextChunk(
  chunk: { text: string },
  role: "assistant" | "user",
): SessionNotification["update"] {
  return {
    sessionUpdate: messageUpdateType(role),
    content: { type: "text", text: chunk.text },
  };
}

function handleImageChunk(
  chunk: {
    source: { type: string; data?: string; media_type?: string; url?: string };
  },
  role: "assistant" | "user",
): SessionNotification["update"] {
  return {
    sessionUpdate: messageUpdateType(role),
    content: {
      type: "image",
      data: chunk.source.type === "base64" ? (chunk.source.data ?? "") : "",
      mimeType:
        chunk.source.type === "base64" ? (chunk.source.media_type ?? "") : "",
      uri: chunk.source.type === "url" ? chunk.source.url : undefined,
    },
  };
}

function handleThinkingChunk(chunk: {
  thinking: string;
}): SessionNotification["update"] {
  return {
    sessionUpdate: "agent_thought_chunk",
    content: { type: "text", text: chunk.thinking },
  };
}

function handleToolUseChunk(
  chunk: ToolUseCache[string],
  ctx: ChunkHandlerContext,
): SessionNotification["update"] | null {
  ctx.toolUseCache[chunk.id] = chunk;

  if (chunk.name === "TodoWrite") {
    const input = chunk.input as { todos?: unknown[] };
    if (Array.isArray(input.todos)) {
      return {
        sessionUpdate: "plan",
        entries: planEntries(chunk.input as { todos: ClaudePlanEntry[] }),
      };
    }
    return null;
  }

  registerHookCallback(chunk.id, {
    onPostToolUseHook: async (toolUseId, _toolInput, toolResponse) => {
      const toolUse = ctx.toolUseCache[toolUseId];
      if (toolUse) {
        await ctx.client.sessionUpdate({
          sessionId: ctx.sessionId,
          update: {
            _meta: toolMeta(toolUse.name, toolResponse),
            toolCallId: toolUseId,
            sessionUpdate: "tool_call_update",
          },
        });
      } else {
        ctx.logger.error(
          `Got a tool response for tool use that wasn't tracked: ${toolUseId}`,
        );
      }
    },
  });

  let rawInput: Record<string, unknown> | undefined;
  try {
    rawInput = JSON.parse(JSON.stringify(chunk.input));
  } catch {
    // ignore
  }

  return {
    _meta: toolMeta(chunk.name),
    toolCallId: chunk.id,
    sessionUpdate: "tool_call",
    rawInput,
    status: "pending",
    ...toolInfoFromToolUse(chunk, ctx.fileContentCache, ctx.logger),
  };
}

function handleToolResultChunk(
  chunk: ContentChunk & { tool_use_id: string; is_error?: boolean },
  ctx: ChunkHandlerContext,
): SessionNotification["update"] | null {
  const toolUse = ctx.toolUseCache[chunk.tool_use_id];
  if (!toolUse) {
    ctx.logger.error(
      `Got a tool result for tool use that wasn't tracked: ${chunk.tool_use_id}`,
    );
    return null;
  }

  if (toolUse.name === "TodoWrite") {
    return null;
  }

  return {
    _meta: toolMeta(toolUse.name),
    toolCallId: chunk.tool_use_id,
    sessionUpdate: "tool_call_update",
    status: chunk.is_error ? "failed" : "completed",
    ...toolUpdateFromToolResult(
      chunk as Parameters<typeof toolUpdateFromToolResult>[0],
      toolUse,
    ),
  };
}

function processContentChunk(
  chunk: ContentChunk,
  role: "assistant" | "user",
  ctx: ChunkHandlerContext,
): SessionNotification["update"] | null {
  switch (chunk.type) {
    case "text":
    case "text_delta":
      return handleTextChunk(chunk, role);

    case "image":
      return handleImageChunk(chunk, role);

    case "thinking":
    case "thinking_delta":
      return handleThinkingChunk(chunk);

    case "tool_use":
    case "server_tool_use":
    case "mcp_tool_use":
      return handleToolUseChunk(chunk as ToolUseCache[string], ctx);

    case "tool_result":
    case "tool_search_tool_result":
    case "web_fetch_tool_result":
    case "web_search_tool_result":
    case "code_execution_tool_result":
    case "bash_code_execution_tool_result":
    case "text_editor_code_execution_tool_result":
    case "mcp_tool_result":
      return handleToolResultChunk(
        chunk as ContentChunk & { tool_use_id: string; is_error?: boolean },
        ctx,
      );

    case "document":
    case "search_result":
    case "redacted_thinking":
    case "input_json_delta":
    case "citations_delta":
    case "signature_delta":
    case "container_upload":
      return null;

    default:
      unreachable(chunk, ctx.logger);
      return null;
  }
}

export function toAcpNotifications(
  content:
    | string
    | ContentBlockParam[]
    | BetaContentBlock[]
    | BetaRawContentBlockDelta[],
  role: "assistant" | "user",
  sessionId: string,
  toolUseCache: ToolUseCache,
  fileContentCache: { [key: string]: string },
  client: AgentSideConnection,
  logger: Logger,
): SessionNotification[] {
  if (typeof content === "string") {
    return [
      {
        sessionId,
        update: {
          sessionUpdate: messageUpdateType(role),
          content: { type: "text", text: content },
        },
      },
    ];
  }

  const ctx: ChunkHandlerContext = {
    sessionId,
    toolUseCache,
    fileContentCache,
    client,
    logger,
  };
  const output: SessionNotification[] = [];

  for (const chunk of content) {
    const update = processContentChunk(chunk, role, ctx);
    if (update) {
      output.push({ sessionId, update });
    }
  }

  return output;
}

export function streamEventToAcpNotifications(
  message: SDKPartialAssistantMessage,
  sessionId: string,
  toolUseCache: ToolUseCache,
  fileContentCache: { [key: string]: string },
  client: AgentSideConnection,
  logger: Logger,
): SessionNotification[] {
  const event = message.event;
  switch (event.type) {
    case "content_block_start":
      return toAcpNotifications(
        [event.content_block],
        "assistant",
        sessionId,
        toolUseCache,
        fileContentCache,
        client,
        logger,
      );
    case "content_block_delta":
      return toAcpNotifications(
        [event.delta],
        "assistant",
        sessionId,
        toolUseCache,
        fileContentCache,
        client,
        logger,
      );
    case "message_start":
    case "message_delta":
    case "message_stop":
    case "content_block_stop":
      return [];

    default:
      unreachable(event, logger);
      return [];
  }
}
