import type { PostHogAPIClient } from "./posthog-api.js";
import type { StoredNotification } from "./types.js";
import { Logger } from "./utils/logger.js";

export interface SessionLogConfig {
  taskId: string;
  runId: string;
}

export class SessionLogWriter {
  private posthogAPI?: PostHogAPIClient;
  private pendingEntries: Map<string, StoredNotification[]> = new Map();
  private flushTimeouts: Map<string, NodeJS.Timeout> = new Map();
  private configs: Map<string, SessionLogConfig> = new Map();
  private logger: Logger;

  constructor(posthogAPI?: PostHogAPIClient, logger?: Logger) {
    this.posthogAPI = posthogAPI;
    this.logger =
      logger ?? new Logger({ debug: false, prefix: "[SessionLogWriter]" });

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

  register(sessionId: string, config: SessionLogConfig): void {
    this.configs.set(sessionId, config);
  }

  isRegistered(sessionId: string): boolean {
    return this.configs.has(sessionId);
  }

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
}
