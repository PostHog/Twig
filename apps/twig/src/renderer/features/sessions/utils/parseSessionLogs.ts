/// <reference path="../../../types/electron.d.ts" />

import {
  CLIENT_METHODS,
  type RequestPermissionRequest,
  type SessionNotification,
} from "@agentclientprotocol/sdk";
import type { StoredLogEntry as BaseStoredLogEntry } from "@shared/types/session-events";
import { trpcVanilla } from "@/renderer/trpc";

export interface StoredLogEntry extends BaseStoredLogEntry {
  direction?: "client" | "agent";
}

export interface ParsedSessionLogs {
  notifications: SessionNotification[];
  rawEntries: StoredLogEntry[];
  sessionId?: string;
  adapter?: "claude" | "codex";
  model?: string;
}

/**
 * Fetch and parse session logs from S3.
 * Returns both parsed SessionNotifications and raw log entries.
 */
export async function fetchSessionLogs(
  logUrl: string,
): Promise<ParsedSessionLogs> {
  if (!logUrl) {
    return { notifications: [], rawEntries: [] };
  }

  try {
    const content = await trpcVanilla.logs.fetchS3Logs.query({ logUrl });
    if (!content?.trim()) {
      return { notifications: [], rawEntries: [] };
    }

    const notifications: SessionNotification[] = [];
    const rawEntries: StoredLogEntry[] = [];
    let sessionId: string | undefined;
    let adapter: "claude" | "codex" | undefined;
    let model: string | undefined;

    for (const line of content.trim().split("\n")) {
      try {
        const stored = JSON.parse(line) as StoredLogEntry;

        const msg = stored.notification;
        if (msg) {
          const hasId = msg.id !== undefined;
          const hasMethod = msg.method !== undefined;
          const hasResult = msg.result !== undefined || msg.error !== undefined;

          if (hasId && hasMethod) {
            stored.direction = "client";
          } else if (hasId && hasResult) {
            stored.direction = "agent";
          } else if (hasMethod && !hasId) {
            stored.direction = "agent";
          }
        }

        rawEntries.push(stored);

        if (
          stored.type === "notification" &&
          stored.notification?.method === "session/update" &&
          stored.notification?.params
        ) {
          notifications.push(stored.notification.params as SessionNotification);

          const params = stored.notification.params as {
            update?: {
              sessionUpdate?: string;
              configOptions?: Array<{ id: string; currentValue?: string }>;
            };
          };
          if (params.update?.sessionUpdate === "config_option_update") {
            const modelOption = params.update.configOptions?.find(
              (opt) => opt.id === "model",
            );
            if (modelOption?.currentValue) {
              model = modelOption.currentValue;
            }
          }
        }

        if (
          stored.type === "notification" &&
          stored.notification?.method?.endsWith("posthog/sdk_session") &&
          stored.notification?.params
        ) {
          const params = stored.notification.params as {
            sessionId?: string;
            sdkSessionId?: string;
            adapter?: "claude" | "codex";
          };
          if (params.sessionId) {
            sessionId = params.sessionId;
          } else if (params.sdkSessionId) {
            sessionId = params.sdkSessionId;
          }
          if (params.adapter) {
            adapter = params.adapter;
          } else if (sessionId) {
            adapter = "claude";
          }
        }
      } catch {
        // Skip malformed lines
      }
    }

    return { notifications, rawEntries, sessionId, adapter, model };
  } catch {
    return { notifications: [], rawEntries: [] };
  }
}

export type PermissionRequest = Omit<RequestPermissionRequest, "sessionId"> & {
  taskRunId: string;
  receivedAt: number;
};

type SessionUpdate = {
  sessionUpdate?: string;
  toolCallId?: string;
  status?: string;
};

type NotificationMsg = StoredLogEntry["notification"];

function getSessionUpdate(msg: NotificationMsg): SessionUpdate | null {
  if (msg?.method !== "session/update") return null;
  return (msg.params as { update?: SessionUpdate })?.update ?? null;
}

function getPermissionToolCallId(msg: NotificationMsg): string | null {
  if (msg?.method !== CLIENT_METHODS.session_request_permission) return null;
  return (msg.params as RequestPermissionRequest)?.toolCall?.toolCallId ?? null;
}

function isTerminalStatus(status?: string): boolean {
  return (
    status === "in_progress" || status === "completed" || status === "failed"
  );
}

/**
 * Scan log entries to find pending permission requests.
 * A permission is pending if:
 * 1. We have a session/request_permission for a toolCallId
 * 2. No subsequent tool_call_update
 * 3. No assistant messages after the permission request (conversation hasn't moved on)
 */
export function findPendingPermissions(
  entries: StoredLogEntry[],
): Map<string, PermissionRequest> {
  const permissionRequests = new Map<
    string,
    { entry: StoredLogEntry; index: number }
  >();
  const resolvedToolCalls = new Set<string>();
  let lastAssistantMessageIndex = -1;

  entries.forEach((entry, i) => {
    const msg = entry.notification;

    const permissionToolCallId = getPermissionToolCallId(msg);
    if (permissionToolCallId) {
      permissionRequests.set(permissionToolCallId, { entry, index: i });
    }

    const update = getSessionUpdate(msg);
    if (!update) return;

    const isResolvedToolCall =
      update.sessionUpdate === "tool_call_update" &&
      update.toolCallId &&
      isTerminalStatus(update.status);

    if (isResolvedToolCall) {
      resolvedToolCalls.add(update.toolCallId!);
    }

    if (update.sessionUpdate === "assistant_message") {
      lastAssistantMessageIndex = i;
    }
  });

  const pending = new Map<string, PermissionRequest>();
  for (const [toolCallId, { entry, index }] of permissionRequests) {
    const isResolved = resolvedToolCalls.has(toolCallId);
    const isStale = lastAssistantMessageIndex > index;
    if (isResolved || isStale) continue;

    const params = entry.notification?.params as RequestPermissionRequest;
    const { sessionId, ...rest } = params;
    pending.set(toolCallId, {
      ...rest,
      taskRunId: sessionId,
      receivedAt: entry.timestamp
        ? new Date(entry.timestamp).getTime()
        : Date.now(),
    });
  }

  return pending;
}
