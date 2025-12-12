/// <reference path="../../../types/electron.d.ts" />

import type { SessionNotification } from "@agentclientprotocol/sdk";
import { trpcVanilla } from "@/renderer/trpc";

export interface StoredLogEntry {
  type: string;
  timestamp?: string;
  notification?: {
    id?: number;
    method?: string;
    params?: unknown;
    result?: unknown;
    error?: unknown;
  };
  direction?: "client" | "agent";
}

export interface ParsedSessionLogs {
  notifications: SessionNotification[];
  rawEntries: StoredLogEntry[];
  sdkSessionId?: string;
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
    let sdkSessionId: string | undefined;

    for (const line of content.trim().split("\n")) {
      try {
        const stored = JSON.parse(line) as StoredLogEntry;

        // Infer direction from message structure:
        // - Request (has id + method) = client → agent
        // - Response (has id + result/error) = agent → client
        // - Notification (has method, no id) = agent → client
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

        // Extract session/update notifications
        if (
          stored.type === "notification" &&
          stored.notification?.method === "session/update" &&
          stored.notification?.params
        ) {
          notifications.push(stored.notification.params as SessionNotification);
        }

        // Extract SDK session ID from _posthog/sdk_session notification
        if (
          stored.type === "notification" &&
          stored.notification?.method?.endsWith("posthog/sdk_session") &&
          stored.notification?.params
        ) {
          const params = stored.notification.params as {
            sdkSessionId?: string;
          };
          if (params.sdkSessionId) {
            sdkSessionId = params.sdkSessionId;
          }
        }
      } catch {
        // Skip malformed lines
      }
    }

    return { notifications, rawEntries, sdkSessionId };
  } catch {
    return { notifications: [], rawEntries: [] };
  }
}
