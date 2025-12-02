import type { SessionNotification } from "@agentclientprotocol/sdk";
import type { PostHogAPIClient, TaskRunUpdate } from "./posthog-api.js";
import type {
  StoredEntry,
  StoredNotification,
  StoredSessionNotification,
  TaskRun,
} from "./types.js";
import { Logger } from "./utils/logger.js";

export interface SessionPersistenceConfig {
  taskId: string;
  runId: string;
  logUrl: string;
  sdkSessionId?: string;
}

export class SessionStore {
  private posthogAPI?: PostHogAPIClient;
  private pendingNotifications: Map<string, StoredEntry[]> = new Map();
  private flushTimeouts: Map<string, NodeJS.Timeout> = new Map();
  private configs: Map<string, SessionPersistenceConfig> = new Map();
  private logger: Logger;

  constructor(posthogAPI?: PostHogAPIClient, logger?: Logger) {
    this.posthogAPI = posthogAPI;
    this.logger = logger ?? new Logger({ debug: false, prefix: "[SessionStore]" });

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

  /**
   * Add a custom notification following ACP extensibility model.
   * Method names should start with underscore (e.g., `_posthog/phase_start`).
   */
  addNotification(
    sessionId: string,
    method: string,
    params: Record<string, unknown>,
  ): void {
    const config = this.configs.get(sessionId);
    if (!config) {
      this.logger.error(`Session ${sessionId} not registered for persistence`);
      return;
    }

    const notification: StoredNotification = {
      type: "notification",
      timestamp: new Date().toISOString(),
      notification: {
        jsonrpc: "2.0",
        method,
        params,
      },
    };

    const pending = this.pendingNotifications.get(sessionId) ?? [];
    pending.push(notification);
    this.pendingNotifications.set(sessionId, pending);

    this.scheduleFlush(sessionId);
  }

  /**
   * Append an ACP session notification for persistence.
   * Used to store session updates like tool_call, agent_message_chunk, etc.
   */
  appendSessionNotification(
    sessionId: string,
    notification: SessionNotification,
  ): void {
    const config = this.configs.get(sessionId);
    if (!config) {
      // Session not registered for persistence, silently skip
      return;
    }

    const entry: StoredSessionNotification = {
      type: "acp_session_notification",
      timestamp: new Date().toISOString(),
      notification,
    };

    const pending = this.pendingNotifications.get(sessionId) ?? [];
    pending.push(entry);
    this.pendingNotifications.set(sessionId, pending);

    this.scheduleFlush(sessionId);
  }

  /** Load entries from S3 */
  async load(logUrl: string): Promise<StoredEntry[]> {
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
        (entry): entry is StoredEntry =>
          entry?.type === "notification" ||
          entry?.type === "acp_session_notification",
      );
  }

  /** Load and extract SessionNotifications from S3 */
  async loadSessionNotifications(logUrl: string): Promise<SessionNotification[]> {
    const entries = await this.load(logUrl);
    return entries
      .filter(
        (entry): entry is StoredSessionNotification =>
          entry.type === "acp_session_notification",
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

    if (!this.posthogAPI) {
      this.logger.debug("No PostHog API configured, skipping flush");
      return;
    }

    try {
      await this.posthogAPI.appendTaskRunLog(config.taskId, config.runId, pending);
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

  /** Get the persistence config for a session */
  getConfig(sessionId: string): SessionPersistenceConfig | undefined {
    return this.configs.get(sessionId);
  }

  /**
   * Start a session for persistence.
   * Loads the task run and updates status to "in_progress".
   */
  async start(
    sessionId: string,
    taskId: string,
    runId: string,
  ): Promise<TaskRun | undefined> {
    if (!this.posthogAPI) {
      this.logger.debug("No PostHog API configured, registering session without persistence");
      this.register(sessionId, {
        taskId,
        runId,
        logUrl: "",
      });
      return undefined;
    }

    const taskRun = await this.posthogAPI.getTaskRun(taskId, runId);

    this.register(sessionId, {
      taskId,
      runId,
      logUrl: taskRun.log_url,
    });

    await this.updateTaskRun(sessionId, { status: "in_progress" });

    this.logger.info("Session started for persistence", {
      sessionId,
      taskId,
      runId,
      logUrl: taskRun.log_url,
    });

    return taskRun;
  }

  /**
   * Mark a session as completed.
   * Flushes pending notifications and updates task run status.
   */
  async complete(sessionId: string): Promise<void> {
    await this.flush(sessionId);
    await this.updateTaskRun(sessionId, { status: "completed" });
    this.logger.info("Session completed", { sessionId });
  }

  /**
   * Mark a session as failed.
   * Flushes pending notifications and updates task run status with error.
   */
  async fail(sessionId: string, error: Error | string): Promise<void> {
    await this.flush(sessionId);
    const message = typeof error === "string" ? error : error.message;
    await this.updateTaskRun(sessionId, {
      status: "failed",
      error_message: message,
    });
    this.logger.error("Session failed", { sessionId, error: message });
  }

  /**
   * Update the task run associated with a session.
   */
  async updateTaskRun(
    sessionId: string,
    update: TaskRunUpdate,
  ): Promise<TaskRun | undefined> {
    const config = this.configs.get(sessionId);
    if (!config) {
      this.logger.error(
        `Cannot update task run: session ${sessionId} not registered`,
      );
      return undefined;
    }

    if (!this.posthogAPI) {
      this.logger.debug("No PostHog API configured, skipping task run update");
      return undefined;
    }

    try {
      return await this.posthogAPI.updateTaskRun(
        config.taskId,
        config.runId,
        update,
      );
    } catch (error) {
      this.logger.error("Failed to update task run:", error);
      return undefined;
    }
  }
}
