import { POSTHOG_NOTIFICATIONS } from "../../acp-extensions.js";
import type { StoredNotification } from "../../types.js";

export function createNotification(
  method: string,
  params: Record<string, unknown>,
): StoredNotification {
  return {
    type: "notification",
    timestamp: new Date().toISOString(),
    notification: {
      jsonrpc: "2.0",
      method,
      params,
    },
  };
}

export function createUserMessage(content: string): StoredNotification {
  return createNotification("session/update", {
    update: {
      sessionUpdate: "user_message",
      content: { type: "text", text: content },
    },
  });
}

export function createAgentChunk(text: string): StoredNotification {
  return createNotification("session/update", {
    update: {
      sessionUpdate: "agent_message_chunk",
      content: { type: "text", text },
    },
  });
}

export function createToolCall(
  toolCallId: string,
  toolName: string,
  toolInput: unknown,
): StoredNotification {
  return createNotification("session/update", {
    update: {
      sessionUpdate: "tool_call",
      _meta: {
        claudeCode: { toolCallId, toolName, toolInput },
      },
    },
  });
}

export function createToolResult(
  toolCallId: string,
  toolResponse: unknown,
): StoredNotification {
  return createNotification("session/update", {
    update: {
      sessionUpdate: "tool_result",
      _meta: {
        claudeCode: { toolCallId, toolResponse },
      },
    },
  });
}

export function createTreeSnapshotNotification(
  treeHash: string,
  archiveUrl?: string,
  options: { interrupted?: boolean; device?: { type: "local" | "cloud" } } = {},
): StoredNotification {
  return createNotification(POSTHOG_NOTIFICATIONS.TREE_SNAPSHOT, {
    treeHash,
    baseCommit: "abc123",
    archiveUrl,
    changes: [{ path: "file.ts", status: "A" }],
    timestamp: new Date().toISOString(),
    ...options,
  });
}

export function createStatusNotification(
  status: "connected" | "disconnected" | "error",
  message?: string,
): StoredNotification {
  return createNotification("session/update", {
    update: {
      sessionUpdate: "status",
      status,
      message,
    },
  });
}
