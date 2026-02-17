import type { SessionContext } from "./otel-log-writer.js";
import type { PostHogAPIClient } from "./posthog-api.js";
import type { StoredNotification } from "./types.js";
import { Logger } from "./utils/logger.js";

export interface SessionLogWriterOptions {
  /** PostHog API client for log persistence */
  posthogAPI?: PostHogAPIClient;
  /** Logger instance */
  logger?: Logger;
}

interface ChunkBuffer {
  text: string;
  firstTimestamp: string;
}

interface SessionState {
  context: SessionContext;
  chunkBuffer?: ChunkBuffer;
}

export class SessionLogWriter {
  private static readonly FLUSH_DEBOUNCE_MS = 500;
  private static readonly FLUSH_MAX_INTERVAL_MS = 5000;

  private posthogAPI?: PostHogAPIClient;
  private pendingEntries: Map<string, StoredNotification[]> = new Map();
  private flushTimeouts: Map<string, NodeJS.Timeout> = new Map();
  private lastFlushAttemptTime: Map<string, number> = new Map();
  private sessions: Map<string, SessionState> = new Map();
  private messageCounts: Map<string, number> = new Map();
  private logger: Logger;

  constructor(options: SessionLogWriterOptions = {}) {
    this.posthogAPI = options.posthogAPI;
    this.logger =
      options.logger ??
      new Logger({ debug: false, prefix: "[SessionLogWriter]" });
  }

  async flushAll(): Promise<void> {
    const sessionIds = [...this.sessions.keys()];
    const pendingCounts = sessionIds.map((id) => ({
      id,
      pending: this.pendingEntries.get(id)?.length ?? 0,
      messages: this.messageCounts.get(id) ?? 0,
    }));
    this.logger.info("flushAll called", {
      sessions: sessionIds.length,
      pending: pendingCounts,
    });

    const flushPromises: Promise<void>[] = [];
    for (const sessionId of sessionIds) {
      flushPromises.push(this.flush(sessionId));
    }
    await Promise.all(flushPromises);
  }

  register(sessionId: string, context: SessionContext): void {
    if (this.sessions.has(sessionId)) {
      return;
    }

    this.logger.info("Session registered", {
      sessionId,
      taskId: context.taskId,
    });
    this.sessions.set(sessionId, { context });
    this.lastFlushAttemptTime.set(sessionId, Date.now());
  }

  isRegistered(sessionId: string): boolean {
    return this.sessions.has(sessionId);
  }

  appendRawLine(sessionId: string, line: string): void {
    const session = this.sessions.get(sessionId);
    if (!session) {
      this.logger.warn("appendRawLine called for unregistered session", {
        sessionId,
      });
      return;
    }

    const count = (this.messageCounts.get(sessionId) ?? 0) + 1;
    this.messageCounts.set(sessionId, count);
    if (count % 10 === 1) {
      this.logger.info("Messages received", { count, sessionId });
    }

    try {
      const message = JSON.parse(line);
      const timestamp = new Date().toISOString();

      // Check if this is an agent_message_chunk event
      if (this.isAgentMessageChunk(message)) {
        const text = this.extractChunkText(message);
        if (text) {
          if (!session.chunkBuffer) {
            session.chunkBuffer = { text, firstTimestamp: timestamp };
          } else {
            session.chunkBuffer.text += text;
          }
        }
        // Don't emit chunk events
        return;
      }

      // Non-chunk event: flush any buffered chunks first
      this.emitCoalescedMessage(sessionId, session);

      const entry: StoredNotification = {
        type: "notification",
        timestamp,
        notification: message,
      };

      if (this.posthogAPI) {
        const pending = this.pendingEntries.get(sessionId) ?? [];
        pending.push(entry);
        this.pendingEntries.set(sessionId, pending);
        this.scheduleFlush(sessionId);
      }
    } catch {
      this.logger.warn("Failed to parse raw line for persistence", {
        sessionId,
        lineLength: line.length,
      });
    }
  }

  async flush(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      this.logger.warn("flush: no session found", { sessionId });
      return;
    }

    // Emit any buffered chunks before flushing
    this.emitCoalescedMessage(sessionId, session);

    const pending = this.pendingEntries.get(sessionId);
    if (!this.posthogAPI || !pending?.length) {
      this.logger.info("flush: nothing to persist", {
        sessionId,
        hasPosthogAPI: !!this.posthogAPI,
        pendingCount: pending?.length ?? 0,
      });
      return;
    }

    this.pendingEntries.delete(sessionId);
    const timeout = this.flushTimeouts.get(sessionId);
    if (timeout) {
      clearTimeout(timeout);
      this.flushTimeouts.delete(sessionId);
    }

    this.lastFlushAttemptTime.set(sessionId, Date.now());

    try {
      await this.posthogAPI.appendTaskRunLog(
        session.context.taskId,
        session.context.runId,
        pending,
      );
      this.logger.info("Flushed session logs", {
        sessionId,
        entryCount: pending.length,
      });
    } catch (error) {
      this.logger.error("Failed to persist session logs:", error);

      const currentPending = this.pendingEntries.get(sessionId) ?? [];
      this.pendingEntries.set(sessionId, [...pending, ...currentPending]);
      this.scheduleFlush(sessionId);
    }
  }

  private isAgentMessageChunk(message: Record<string, unknown>): boolean {
    if (message.method !== "session/update") return false;
    const params = message.params as Record<string, unknown> | undefined;
    const update = params?.update as Record<string, unknown> | undefined;
    return update?.sessionUpdate === "agent_message_chunk";
  }

  private extractChunkText(message: Record<string, unknown>): string {
    const params = message.params as Record<string, unknown> | undefined;
    const update = params?.update as Record<string, unknown> | undefined;
    const content = update?.content as
      | { type: string; text?: string }
      | undefined;
    if (content?.type === "text" && content.text) {
      return content.text;
    }
    return "";
  }

  private emitCoalescedMessage(sessionId: string, session: SessionState): void {
    if (!session.chunkBuffer) return;

    const { text, firstTimestamp } = session.chunkBuffer;
    session.chunkBuffer = undefined;

    const entry: StoredNotification = {
      type: "notification",
      timestamp: firstTimestamp,
      notification: {
        jsonrpc: "2.0",
        method: "session/update",
        params: {
          update: {
            sessionUpdate: "agent_message",
            content: { type: "text", text },
          },
        },
      },
    };

    if (this.posthogAPI) {
      const pending = this.pendingEntries.get(sessionId) ?? [];
      pending.push(entry);
      this.pendingEntries.set(sessionId, pending);
      this.scheduleFlush(sessionId);
    }
  }

  private scheduleFlush(sessionId: string): void {
    const existing = this.flushTimeouts.get(sessionId);
    if (existing) clearTimeout(existing);

    const lastAttempt = this.lastFlushAttemptTime.get(sessionId) ?? 0;
    const elapsed = Date.now() - lastAttempt;
    // If we've been accumulating for longer than the max interval, flush immediately
    const delay =
      elapsed >= SessionLogWriter.FLUSH_MAX_INTERVAL_MS
        ? 0
        : SessionLogWriter.FLUSH_DEBOUNCE_MS;

    const timeout = setTimeout(() => this.flush(sessionId), delay);
    this.flushTimeouts.set(sessionId, timeout);
  }
}
