import type {
  AgentSideConnection,
  Role,
  SessionNotification,
} from "@agentclientprotocol/sdk";
import { RequestError } from "@agentclientprotocol/sdk";
import type {
  SDKPartialAssistantMessage,
  SDKUserMessage,
} from "@anthropic-ai/claude-agent-sdk";
import type { ContentBlockParam } from "@anthropic-ai/sdk/resources";
import type {
  BetaContentBlock,
  BetaRawContentBlockDelta,
} from "@anthropic-ai/sdk/resources/beta.mjs";
import { image, text } from "@/utils/acp-content.js";
import { unreachable } from "@/utils/common.js";
import type { Logger } from "@/utils/logger.js";
import { registerHookCallback } from "../hooks.js";
import type { Session, ToolUpdateMeta, ToolUseCache } from "../types.js";
import {
  type ClaudePlanEntry,
  planEntries,
  toolInfoFromToolUse,
  toolUpdateFromToolResult,
} from "./tool-use-to-acp.js";

type AnthropicContentChunk =
  | ContentBlockParam
  | BetaContentBlock
  | BetaRawContentBlockDelta;

type AnthropicMessageContent = string | Array<{ type: string; text?: string }>;

interface AnthropicMessageWithContent {
  type: Role;
  message: {
    content: AnthropicMessageContent;
    role?: Role;
    model?: string;
  };
}

type ChunkHandlerContext = {
  sessionId: string;
  toolUseCache: ToolUseCache;
  fileContentCache: { [key: string]: string };
  client: AgentSideConnection;
  logger: Logger;
};

export interface MessageHandlerContext {
  session: Session;
  sessionId: string;
  client: AgentSideConnection;
  toolUseCache: ToolUseCache;
  fileContentCache: { [key: string]: string };
  logger: Logger;
}

function messageUpdateType(role: Role) {
  return role === "assistant" ? "agent_message_chunk" : "user_message_chunk";
}

function toolMeta(toolName: string, toolResponse?: unknown): ToolUpdateMeta {
  return toolResponse
    ? { claudeCode: { toolName, toolResponse } }
    : { claudeCode: { toolName } };
}

function handleTextChunk(
  chunk: { text: string },
  role: Role,
): SessionNotification["update"] {
  return {
    sessionUpdate: messageUpdateType(role),
    content: text(chunk.text),
  };
}

function handleImageChunk(
  chunk: {
    source: { type: string; data?: string; media_type?: string; url?: string };
  },
  role: Role,
): SessionNotification["update"] {
  return {
    sessionUpdate: messageUpdateType(role),
    content: image(
      chunk.source.type === "base64" ? (chunk.source.data ?? "") : "",
      chunk.source.type === "base64" ? (chunk.source.media_type ?? "") : "",
      chunk.source.type === "url" ? chunk.source.url : undefined,
    ),
  };
}

function handleThinkingChunk(chunk: {
  thinking: string;
}): SessionNotification["update"] {
  return {
    sessionUpdate: "agent_thought_chunk",
    content: text(chunk.thinking),
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
  chunk: AnthropicContentChunk & { tool_use_id: string; is_error?: boolean },
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
  chunk: AnthropicContentChunk,
  role: Role,
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
        chunk as AnthropicContentChunk & {
          tool_use_id: string;
          is_error?: boolean;
        },
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

function toAcpNotifications(
  content:
    | string
    | ContentBlockParam[]
    | BetaContentBlock[]
    | BetaRawContentBlockDelta[],
  role: Role,
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
          content: text(content),
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

function streamEventToAcpNotifications(
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

export async function handleSystemMessage(
  message: any,
  context: MessageHandlerContext,
): Promise<void> {
  const { session, sessionId, client, logger } = context;

  switch (message.subtype) {
    case "init":
      if (message.session_id && session && !session.sessionId) {
        session.sessionId = message.session_id;
        if (session.taskRunId) {
          await client.extNotification("_posthog/sdk_session", {
            taskRunId: session.taskRunId,
            sessionId: message.session_id,
            adapter: "claude",
          });
        }
      }
      break;
    case "compact_boundary":
      await client.extNotification("_posthog/compact_boundary", {
        sessionId,
        trigger: message.compact_metadata.trigger,
        preTokens: message.compact_metadata.pre_tokens,
      });
      break;
    case "hook_response":
      logger.info("Hook response received", {
        hookName: message.hook_name,
        hookEvent: message.hook_event,
      });
      break;
    case "status":
      if (message.status === "compacting") {
        logger.info("Session compacting started", { sessionId });
        await client.extNotification("_posthog/status", {
          sessionId,
          status: "compacting",
        });
      }
      break;
    case "task_notification": {
      logger.info("Task notification received", {
        sessionId,
        taskId: message.task_id,
        status: message.status,
        summary: message.summary,
      });
      await client.extNotification("_posthog/task_notification", {
        sessionId,
        taskId: message.task_id,
        status: message.status,
        summary: message.summary,
        outputFile: message.output_file,
      });
      break;
    }
    default:
      break;
  }
}

export function handleResultMessage(
  message: any,
  context: MessageHandlerContext,
): { shouldStop: boolean; stopReason?: string; error?: Error } {
  const { session } = context;

  if (session.cancelled) {
    return {
      shouldStop: true,
      stopReason: "cancelled",
    };
  }

  switch (message.subtype) {
    case "success": {
      if (message.result.includes("Please run /login")) {
        return {
          shouldStop: true,
          error: RequestError.authRequired(),
        };
      }
      if (message.is_error) {
        return {
          shouldStop: true,
          error: RequestError.internalError(undefined, message.result),
        };
      }
      return { shouldStop: true, stopReason: "end_turn" };
    }
    case "error_during_execution":
      if (message.is_error) {
        return {
          shouldStop: true,
          error: RequestError.internalError(
            undefined,
            message.errors.join(", ") || message.subtype,
          ),
        };
      }
      return { shouldStop: true, stopReason: "end_turn" };
    case "error_max_budget_usd":
    case "error_max_turns":
    case "error_max_structured_output_retries":
      if (message.is_error) {
        return {
          shouldStop: true,
          error: RequestError.internalError(
            undefined,
            message.errors.join(", ") || message.subtype,
          ),
        };
      }
      return { shouldStop: true, stopReason: "max_turn_requests" };
    default:
      return { shouldStop: false };
  }
}

export async function handleStreamEvent(
  message: SDKPartialAssistantMessage,
  context: MessageHandlerContext,
): Promise<void> {
  const { sessionId, client, toolUseCache, fileContentCache, logger } = context;

  for (const notification of streamEventToAcpNotifications(
    message,
    sessionId,
    toolUseCache,
    fileContentCache,
    client,
    logger,
  )) {
    await client.sessionUpdate(notification);
    context.session.notificationHistory.push(notification);
  }
}

function hasLocalCommandStdout(content: AnthropicMessageContent): boolean {
  return (
    typeof content === "string" && content.includes("<local-command-stdout>")
  );
}

function hasLocalCommandStderr(content: AnthropicMessageContent): boolean {
  return (
    typeof content === "string" && content.includes("<local-command-stderr>")
  );
}

function isSimpleUserMessage(message: AnthropicMessageWithContent): boolean {
  return (
    message.type === "user" &&
    (typeof message.message.content === "string" ||
      (Array.isArray(message.message.content) &&
        message.message.content.length === 1 &&
        message.message.content[0].type === "text"))
  );
}

function isLoginRequiredMessage(message: AnthropicMessageWithContent): boolean {
  return (
    message.type === "assistant" &&
    message.message.model === "<synthetic>" &&
    Array.isArray(message.message.content) &&
    message.message.content.length === 1 &&
    message.message.content[0].type === "text" &&
    message.message.content[0].text?.includes("Please run /login") === true
  );
}

function shouldSkipUserAssistantMessage(
  message: AnthropicMessageWithContent,
): boolean {
  return (
    hasLocalCommandStdout(message.message.content) ||
    hasLocalCommandStderr(message.message.content) ||
    isSimpleUserMessage(message) ||
    isLoginRequiredMessage(message)
  );
}

function logSpecialMessages(
  message: AnthropicMessageWithContent,
  logger: Logger,
): void {
  const content = message.message.content;
  if (hasLocalCommandStdout(content) && typeof content === "string") {
    logger.info(content);
  }
  if (hasLocalCommandStderr(content) && typeof content === "string") {
    logger.error(content);
  }
}

function filterMessageContent(
  content: AnthropicMessageContent,
): AnthropicMessageContent {
  if (!Array.isArray(content)) {
    return content;
  }
  return content.filter(
    (block) => block.type !== "text" && block.type !== "thinking",
  );
}

export async function handleUserAssistantMessage(
  message: SDKUserMessage | { type: "assistant"; message: any },
  context: MessageHandlerContext,
): Promise<{ shouldStop?: boolean; error?: Error }> {
  const { session, sessionId, client, toolUseCache, fileContentCache, logger } =
    context;

  if (session.cancelled) {
    return {};
  }

  if (shouldSkipUserAssistantMessage(message)) {
    logSpecialMessages(message, logger);

    if (isLoginRequiredMessage(message)) {
      return { shouldStop: true, error: RequestError.authRequired() };
    }
    return {};
  }

  const content = message.message.content;
  const contentToProcess = filterMessageContent(content);

  for (const notification of toAcpNotifications(
    contentToProcess as typeof content,
    message.message.role,
    sessionId,
    toolUseCache,
    fileContentCache,
    client,
    logger,
  )) {
    await client.sessionUpdate(notification);
    session.notificationHistory.push(notification);
  }

  return {};
}
