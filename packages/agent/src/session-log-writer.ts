import fs from "node:fs";
import path from "node:path";
import type { SessionContext } from "./otel-log-writer.js";
import type { PostHogAPIClient } from "./posthog-api.js";
import type { StoredNotification } from "./types.js";
import { Logger } from "./utils/logger.js";

export interface SessionLogWriterOptions {
  /** PostHog API client for log persistence */
  posthogAPI?: PostHogAPIClient;
  /** Logger instance */
  logger?: Logger;
  /** Local cache path for instant log loading (e.g., ~/.twig) */
  localCachePath?: string;
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
  private posthogAPI?: PostHogAPIClient;
  private pendingEntries: Map<string, StoredNotification[]> = new Map();
  private flushTimeouts: Map<string, NodeJS.Timeout> = new Map();
  private sessions: Map<string, SessionState> = new Map();
  private logger: Logger;
  private localCachePath?: string;

  constructor(options: SessionLogWriterOptions = {}) {
    this.posthogAPI = options.posthogAPI;
    this.localCachePath = options.localCachePath;
    this.logger =
      options.logger ??
      new Logger({ debug: false, prefix: "[SessionLogWriter]" });
  }

  async flushAll(): Promise<void> {
    const flushPromises: Promise<void>[] = [];
    for (const sessionId of this.sessions.keys()) {
      flushPromises.push(this.flush(sessionId));
    }
    await Promise.all(flushPromises);
  }

  register(sessionId: string, context: SessionContext): void {
    if (this.sessions.has(sessionId)) {
      return;
    }

    this.sessions.set(sessionId, { context });

    if (this.localCachePath) {
      const sessionDir = path.join(
        this.localCachePath,
        "sessions",
        context.runId,
      );
      try {
        fs.mkdirSync(sessionDir, { recursive: true });
      } catch (error) {
        this.logger.warn("Failed to create local cache directory", {
          sessionDir,
          error,
        });
      }
    }
  }

  isRegistered(sessionId: string): boolean {
    return this.sessions.has(sessionId);
  }

  appendRawLine(sessionId: string, line: string): void {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return;
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

      this.writeToLocalCache(sessionId, entry);

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
    if (!session) return;

    // Emit any buffered chunks before flushing
    this.emitCoalescedMessage(sessionId, session);

    const pending = this.pendingEntries.get(sessionId);
    if (!this.posthogAPI || !pending?.length) return;

    this.pendingEntries.delete(sessionId);
    const timeout = this.flushTimeouts.get(sessionId);
    if (timeout) {
      clearTimeout(timeout);
      this.flushTimeouts.delete(sessionId);
    }

    try {
      await this.posthogAPI.appendTaskRunLog(
        session.context.taskId,
        session.context.runId,
        pending,
      );
    } catch (error) {
      this.logger.error("Failed to persist session logs:", error);
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

    this.writeToLocalCache(sessionId, entry);

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
    const timeout = setTimeout(() => this.flush(sessionId), 500);
    this.flushTimeouts.set(sessionId, timeout);
  }

  private writeToLocalCache(
    sessionId: string,
    entry: StoredNotification,
  ): void {
    if (!this.localCachePath) return;

    const session = this.sessions.get(sessionId);
    if (!session) return;

    const logPath = path.join(
      this.localCachePath,
      "sessions",
      session.context.runId,
      "logs.ndjson",
    );

    try {
      fs.appendFileSync(logPath, `${JSON.stringify(entry)}\n`);
    } catch (error) {
      this.logger.warn("Failed to write to local cache", { logPath, error });
    }
  }
}
