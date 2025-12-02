import { useAuthStore } from "@features/auth/stores/authStore";
import type {
  AgentEvent,
  ConsoleEvent,
  ErrorEvent,
  StatusEvent,
  TokenEvent,
} from "@posthog/agent";
import { logger } from "@renderer/lib/logger";

const log = logger.scope("event-emitter");

/**
 * Emit events to S3 for a task run
 */
export async function emitEventsToS3(
  taskId: string,
  runId: string,
  events: AgentEvent[],
): Promise<void> {
  const { client } = useAuthStore.getState();
  if (!client) {
    log.warn("Cannot emit events: no API client");
    return;
  }

  try {
    await client.appendTaskRunLog(taskId, runId, events);
  } catch (error) {
    log.warn("Failed to emit events to S3", {
      taskId,
      runId,
      eventCount: events.length,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

/**
 * Emit a single event to S3
 */
export async function emitEventToS3(
  taskId: string,
  runId: string,
  event: AgentEvent,
): Promise<void> {
  return emitEventsToS3(taskId, runId, [event]);
}

// Helper functions to create events

export function createStatusEvent(
  phase: string,
  data?: Partial<Omit<StatusEvent, "type" | "ts" | "phase">>,
): StatusEvent {
  return {
    type: "status",
    ts: Date.now(),
    phase,
    ...data,
  };
}

export function createTokenEvent(
  content: string,
  contentType?: "text" | "thinking" | "tool_input",
): TokenEvent {
  return {
    type: "token",
    ts: Date.now(),
    content,
    contentType,
  };
}

export function createErrorEvent(
  message: string,
  errorType?: string,
): ErrorEvent {
  return {
    type: "error",
    ts: Date.now(),
    message,
    errorType,
  };
}

export function createConsoleEvent(
  level: ConsoleEvent["level"],
  message: string,
): ConsoleEvent {
  return {
    type: "console",
    ts: Date.now(),
    level,
    message,
  };
}
