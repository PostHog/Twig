import type { SessionNotification } from "@agentclientprotocol/sdk";

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
}

/**
 * Fetch and parse session logs from S3.
 * Returns both parsed SessionNotifications and raw log entries.
 */
export async function fetchSessionLogs(
  logUrl: string,
): Promise<ParsedSessionLogs> {
  if (!logUrl) return { notifications: [], rawEntries: [] };

  try {
    const response = await fetch(logUrl);
    if (!response.ok) return { notifications: [], rawEntries: [] };

    const content = await response.text();
    if (!content.trim()) return { notifications: [], rawEntries: [] };

    const notifications: SessionNotification[] = [];
    const rawEntries: StoredLogEntry[] = [];

    for (const line of content.trim().split("\n")) {
      try {
        const stored = JSON.parse(line) as StoredLogEntry;

        // Infer direction from message structure:
        // - Request (has id + method) = client → agent
        // - Response (has id + result/error) = agent → client
        // - Notification (has method, no id) = agent → client
        // TODO: Check if this is correct.
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
      } catch {
        // Skip malformed lines
      }
    }

    return { notifications, rawEntries };
  } catch {
    // Network error or other failure
    return { notifications: [], rawEntries: [] };
  }
}
