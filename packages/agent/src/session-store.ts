import type { SessionNotification } from "@agentclientprotocol/sdk";
import type { PostHogAPIClient } from "./posthog-api.js";
import type { AgentEvent } from "./types.js";
import { Logger } from "./utils/logger.js";

export interface SessionPersistenceConfig {
  taskId: string;
  runId: string;
  logUrl: string;
  sdkSessionId?: string;
}

interface StoredNotification {
  type: "acp_session_notification";
  timestamp: string;
  notification: SessionNotification;
}

export class SessionStore {
  private posthogAPI: PostHogAPIClient;
  private pendingNotifications: Map<string, StoredNotification[]> = new Map();
  private flushTimeouts: Map<string, NodeJS.Timeout> = new Map();
  private configs: Map<string, SessionPersistenceConfig> = new Map();
  private logger = new Logger({ debug: false, prefix: "[SessionStore]" });

  constructor(posthogAPI: PostHogAPIClient) {
    this.posthogAPI = posthogAPI;

    // Flush all pending notifications on process exit
    const flushAllAndExit = async () => {
      const flushPromises: Promise<void>[] = [];
      for (const sessionId of this.configs.keys()) {
        flushPromises.push(this.flush(sessionId));
      }
      await Promise.all(flushPromises);
      process.exit(0);
    };

    process.on("beforeExit", () => {
      flushAllAndExit().catch((e) => this.logger.error("Flush failed:", e));
    });
    process.on("SIGINT", () => {
      flushAllAndExit().catch((e) => this.logger.error("Flush failed:", e));
    });
    process.on("SIGTERM", () => {
      flushAllAndExit().catch((e) => this.logger.error("Flush failed:", e));
    });
  }

  /** Register a session for persistence */
  register(sessionId: string, config: SessionPersistenceConfig): void {
    this.configs.set(sessionId, config);
  }

  /** Unregister and flush pending notifications */
  async unregister(sessionId: string): Promise<void> {
    await this.flush(sessionId);
    this.configs.delete(sessionId);
  }

  /** Check if a session is registered for persistence */
  isRegistered(sessionId: string): boolean {
    return this.configs.has(sessionId);
  }

  /** Queue a notification for batched persistence */
  append(sessionId: string, notification: SessionNotification): void {
    const config = this.configs.get(sessionId);
    if (!config) {
      this.logger.error(`Session ${sessionId} not registered for persistence`);
      return;
    }

    const stored: StoredNotification = {
      type: "acp_session_notification",
      timestamp: new Date().toISOString(),
      notification,
    };

    const pending = this.pendingNotifications.get(sessionId) ?? [];
    pending.push(stored);
    this.pendingNotifications.set(sessionId, pending);

    this.scheduleFlush(sessionId);
  }

  /** Load notifications from S3 */
  async load(logUrl: string): Promise<SessionNotification[]> {
    const response = await fetch(logUrl);

    // Handle S3 errors (e.g., file doesn't exist yet)
    if (!response.ok) {
      // 404/NoSuchKey is expected for new sessions with no logs yet
      return [];
    }

    const content = await response.text();

    if (!content.trim()) return [];

    return content
      .trim()
      .split("\n")
      .map((line) => {
        try {
          return JSON.parse(line);
        } catch {
          return null;
        }
      })
      .filter(
        (entry): entry is StoredNotification =>
          entry?.type === "acp_session_notification",
      )
      .map((entry) => entry.notification);
  }

  /** Force flush pending notifications */
  async flush(sessionId: string): Promise<void> {
    const config = this.configs.get(sessionId);
    const pending = this.pendingNotifications.get(sessionId);

    if (!config || !pending?.length) return;

    this.pendingNotifications.delete(sessionId);
    const timeout = this.flushTimeouts.get(sessionId);
    if (timeout) {
      clearTimeout(timeout);
      this.flushTimeouts.delete(sessionId);
    }

    try {
      await this.posthogAPI.appendTaskRunLog(
        config.taskId,
        config.runId,
        pending as unknown as AgentEvent[],
      );
    } catch (error) {
      this.logger.error("Failed to persist session notifications:", error);
    }
  }

  private scheduleFlush(sessionId: string): void {
    const existing = this.flushTimeouts.get(sessionId);
    if (existing) clearTimeout(existing);
    const timeout = setTimeout(() => this.flush(sessionId), 500);
    this.flushTimeouts.set(sessionId, timeout);
  }
}
