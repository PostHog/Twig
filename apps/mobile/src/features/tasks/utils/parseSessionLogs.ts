import type {
  SessionEvent,
  SessionNotification,
  StoredLogEntry,
} from "../types";

export interface ParsedSessionLogs {
  notifications: SessionNotification[];
  rawEntries: StoredLogEntry[];
}

export function parseSessionLogs(content: string): ParsedSessionLogs {
  if (!content?.trim()) {
    return { notifications: [], rawEntries: [] };
  }

  const notifications: SessionNotification[] = [];
  const rawEntries: StoredLogEntry[] = [];

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
      }
    } catch {
      // Skip malformed lines
    }
  }

  return { notifications, rawEntries };
}

export function convertRawEntriesToEvents(
  rawEntries: StoredLogEntry[],
  notifications: SessionNotification[],
  taskDescription?: string,
): SessionEvent[] {
  const events: SessionEvent[] = [];
  let notificationIdx = 0;

  if (taskDescription) {
    const startTs = rawEntries[0]?.timestamp
      ? new Date(rawEntries[0].timestamp).getTime() - 1
      : Date.now();
    events.push({
      type: "session_update",
      ts: startTs,
      notification: {
        update: {
          sessionUpdate: "user_message_chunk",
          content: { type: "text", text: taskDescription },
        },
      },
    });
  }

  for (const entry of rawEntries) {
    const ts = entry.timestamp
      ? new Date(entry.timestamp).getTime()
      : Date.now();

    events.push({
      type: "acp_message",
      direction: entry.direction ?? "agent",
      ts,
      message: entry.notification,
    });

    if (
      entry.type === "notification" &&
      entry.notification?.method === "session/update" &&
      notificationIdx < notifications.length
    ) {
      events.push({
        type: "session_update",
        ts,
        notification: notifications[notificationIdx],
      });
      notificationIdx++;
    }
  }

  return events;
}
