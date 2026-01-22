import type { AgentSideConnection } from "@agentclientprotocol/sdk";
import { RequestError } from "@agentclientprotocol/sdk";
import type {
  SDKPartialAssistantMessage,
  SDKUserMessage,
} from "@anthropic-ai/claude-agent-sdk";
import type { Logger } from "@/utils/logger.js";
import {
  streamEventToAcpNotifications,
  toAcpNotifications,
} from "./message-conversion.js";
import type { Session, ToolUseCache } from "./types.js";

interface MessageHandlerContext {
  session: Session;
  sessionId: string;
  client: AgentSideConnection;
  toolUseCache: ToolUseCache;
  fileContentCache: { [key: string]: string };
  logger: Logger;
}

type MessageContent = string | Array<{ type: string; text?: string }>;

interface MessageWithContent {
  type: "user" | "assistant";
  message: {
    content: MessageContent;
    role?: string;
    model?: string;
  };
}

export async function handleSystemMessage(
  message: any,
  context: MessageHandlerContext,
): Promise<void> {
  switch (message.subtype) {
    case "init":
      if (message.session_id) {
        const session = context.session;
        if (session && !session.sdkSessionId) {
          session.sdkSessionId = message.session_id;
          context.client.extNotification("_posthog/sdk_session", {
            sessionId: context.sessionId,
            sdkSessionId: message.session_id,
          });
        }
      }
      break;
    case "compact_boundary":
    case "hook_response":
    case "status":
      break;
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

function hasLocalCommandStdout(content: MessageContent): boolean {
  return (
    typeof content === "string" && content.includes("<local-command-stdout>")
  );
}

function hasLocalCommandStderr(content: MessageContent): boolean {
  return (
    typeof content === "string" && content.includes("<local-command-stderr>")
  );
}

function isSimpleUserMessage(message: MessageWithContent): boolean {
  return (
    message.type === "user" &&
    (typeof message.message.content === "string" ||
      (Array.isArray(message.message.content) &&
        message.message.content.length === 1 &&
        message.message.content[0].type === "text"))
  );
}

function isLoginRequiredMessage(message: MessageWithContent): boolean {
  return (
    message.type === "assistant" &&
    message.message.model === "<synthetic>" &&
    Array.isArray(message.message.content) &&
    message.message.content.length === 1 &&
    message.message.content[0].type === "text" &&
    message.message.content[0].text?.includes("Please run /login") === true
  );
}

function shouldSkipUserAssistantMessage(message: MessageWithContent): boolean {
  return (
    hasLocalCommandStdout(message.message.content) ||
    hasLocalCommandStderr(message.message.content) ||
    isSimpleUserMessage(message) ||
    isLoginRequiredMessage(message)
  );
}

function logSpecialMessages(message: MessageWithContent, logger: Logger): void {
  const content = message.message.content;
  if (hasLocalCommandStdout(content) && typeof content === "string") {
    logger.info(content);
  }
  if (hasLocalCommandStderr(content) && typeof content === "string") {
    logger.error(content);
  }
}

function filterMessageContent(content: MessageContent): MessageContent {
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
