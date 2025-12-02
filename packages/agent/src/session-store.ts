import type { PostHogAPIClient, TaskRunUpdate } from "./posthog-api.js";
import type { StoredNotification, TaskRun } from "./types.js";
import { Logger } from "./utils/logger.js";

export interface SessionPersistenceConfig {
  taskId: string;
  runId: string;
  logUrl: string;
  sdkSessionId?: string;
}

export class SessionStore {
  private posthogAPI?: PostHogAPIClient;
  private pendingEntries: Map<string, StoredNotification[]> = new Map();
  private flushTimeouts: Map<string, NodeJS.Timeout> = new Map();
  private configs: Map<string, SessionPersistenceConfig> = new Map();
  private logger: Logger;

  constructor(posthogAPI?: PostHogAPIClient, logger?: Logger) {
    this.posthogAPI = posthogAPI;
    this.logger =
      logger ?? new Logger({ debug: false, prefix: "[SessionStore]" });

    // Flush all pending on process exit
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

  /** Unregister and flush pending */
  async unregister(sessionId: string): Promise<void> {
    await this.flush(sessionId);
    this.configs.delete(sessionId);
  }

  /** Check if a session is registered for persistence */
  isRegistered(sessionId: string): boolean {
    return this.configs.has(sessionId);
  }

  /**
   * Append a raw JSON-RPC line for persistence.
   * Parses and wraps as StoredNotification for the API.
   */
  appendRawLine(sessionId: string, line: string): void {
    const config = this.configs.get(sessionId);
    if (!config) {
      return;
    }

    try {
      const message = JSON.parse(line);
      const entry: StoredNotification = {
        type: "notification",
        timestamp: new Date().toISOString(),
        notification: message,
      };

      const pending = this.pendingEntries.get(sessionId) ?? [];
      pending.push(entry);
      this.pendingEntries.set(sessionId, pending);

      this.scheduleFlush(sessionId);
    } catch {
      this.logger.warn("Failed to parse raw line for persistence", {
        sessionId,
        lineLength: line.length,
      });
    }
  }

  /** Load raw JSON-RPC messages from S3 */
  async load(logUrl: string): Promise<unknown[]> {
    const response = await fetch(logUrl);

    if (!response.ok) {
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
      .filter((entry): entry is unknown => entry !== null);
  }

  /** Force flush pending entries */
  async flush(sessionId: string): Promise<void> {
    const config = this.configs.get(sessionId);
    const pending = this.pendingEntries.get(sessionId);

    if (!config || !pending?.length) return;

    this.pendingEntries.delete(sessionId);
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
      await this.posthogAPI.appendTaskRunLog(
        config.taskId,
        config.runId,
        pending,
      );
    } catch (error) {
      this.logger.error("Failed to persist session logs:", error);
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
      this.logger.debug(
        "No PostHog API configured, registering session without persistence",
      );
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

    return taskRun;
  }

  /**
   * Mark a session as completed.
   */
  async complete(sessionId: string): Promise<void> {
    await this.flush(sessionId);
    await this.updateTaskRun(sessionId, { status: "completed" });
  }

  /**
   * Mark a session as failed.
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
