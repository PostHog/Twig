import type { PostHogAPIClient, TaskRunUpdate } from "./posthog-api.js";
import type { AgentEvent, ConsoleEvent, TaskRun, TokenEvent } from "./types.js";
import type { Logger } from "./utils/logger.js";

interface ProgressMetadata {
  totalSteps?: number;
}

/**
 * Persists task run execution progress to PostHog so clients can poll for updates.
 *
 * The reporter is intentionally best-effort – failures are logged but never
 * allowed to break the agent execution flow.
 */
export class TaskRunProgressReporter {
  private posthogAPI?: PostHogAPIClient;
  private logger: Logger;
  private taskRun?: TaskRun;
  private taskId?: string;
  private totalSteps?: number;
  private lastLogEntry?: string;
  private tokenBuffer: string = "";
  private tokenCount: number = 0;
  private tokenFlushTimer?: NodeJS.Timeout;
  private readonly TOKEN_BATCH_SIZE = 100;
  private readonly TOKEN_FLUSH_INTERVAL_MS = 1000;
  private logWriteQueue: Promise<void> = Promise.resolve();
  private readonly LOG_APPEND_MAX_RETRIES = 3;
  private readonly LOG_APPEND_RETRY_BASE_DELAY_MS = 200;

  constructor(posthogAPI: PostHogAPIClient | undefined, logger: Logger) {
    this.posthogAPI = posthogAPI;
    this.logger = logger.child("TaskRunProgressReporter");
  }

  get runId(): string | undefined {
    return this.taskRun?.id;
  }

  async start(
    taskId: string,
    taskRunId: string,
    metadata: ProgressMetadata = {},
  ): Promise<void> {
    if (!this.posthogAPI) {
      return;
    }

    this.taskId = taskId;
    this.totalSteps = metadata.totalSteps;

    try {
      const run = await this.posthogAPI.getTaskRun(taskId, taskRunId);
      this.taskRun = run;
      this.logger.info("Loaded task run", {
        taskId,
        runId: run.id,
        logUrl: run.log_url ?? "(not yet available)",
      });

      await this.update({ status: "in_progress" }, "Task execution started");
    } catch (error) {
      this.logger.warn("Failed to load task run", {
        taskId,
        error: (error as Error).message,
      });
      throw error;
    }
  }

  async complete(): Promise<void> {
    await this.flushTokens(); // Flush any remaining tokens before completion
    try {
      await this.logWriteQueue;
    } catch (error) {
      this.logger.debug("Pending logs failed to write during completion", {
        error,
      });
    }

    if (this.tokenFlushTimer) {
      clearTimeout(this.tokenFlushTimer);
      this.tokenFlushTimer = undefined;
    }
    await this.update({ status: "completed" }, "Task execution completed");
  }

  async fail(error: Error | string): Promise<void> {
    try {
      await this.logWriteQueue;
    } catch (logError) {
      this.logger.debug("Pending logs failed to write during fail", {
        error: logError,
      });
    }

    const message = typeof error === "string" ? error : error.message;
    await this.update(
      { status: "failed", error_message: message },
      `Task execution failed: ${message}`,
    );
  }

  async appendLog(line: string): Promise<void> {
    await this.update({}, line);
  }

  private async flushTokens(): Promise<void> {
    if (!this.tokenBuffer || this.tokenCount === 0) {
      return;
    }

    const buffer = this.tokenBuffer;
    this.tokenBuffer = "";
    this.tokenCount = 0;

    const tokenEvent: TokenEvent = {
      type: "token",
      ts: Date.now(),
      content: buffer,
    };
    await this.appendEvent(tokenEvent);
  }

  private scheduleTokenFlush(): void {
    if (this.tokenFlushTimer) {
      return;
    }

    this.tokenFlushTimer = setTimeout(() => {
      this.tokenFlushTimer = undefined;
      this.flushTokens().catch((err) => {
        this.logger.warn("Failed to flush tokens", { error: err });
      });
    }, this.TOKEN_FLUSH_INTERVAL_MS);
  }

  private appendEvent(event: AgentEvent): Promise<void> {
    if (!this.posthogAPI || !this.runId || !this.taskId) {
      return Promise.resolve();
    }

    const taskId = this.taskId;
    const runId = this.runId;

    this.logWriteQueue = this.logWriteQueue
      .catch((error) => {
        this.logger.debug("Previous log append failed", {
          taskId,
          runId,
          error: error instanceof Error ? error.message : String(error),
        });
      })
      .then(() => this.writeEvent(taskId, runId, event));

    return this.logWriteQueue;
  }

  private async writeEvent(
    taskId: string,
    runId: string,
    event: AgentEvent,
  ): Promise<void> {
    if (!this.posthogAPI) {
      return;
    }

    for (let attempt = 1; attempt <= this.LOG_APPEND_MAX_RETRIES; attempt++) {
      try {
        await this.posthogAPI.appendTaskRunLog(taskId, runId, [event]);
        return;
      } catch (error) {
        this.logger.warn("Failed to append event", {
          taskId,
          runId,
          attempt,
          maxAttempts: this.LOG_APPEND_MAX_RETRIES,
          error: (error as Error).message,
        });

        if (attempt === this.LOG_APPEND_MAX_RETRIES) {
          return;
        }

        const delayMs =
          this.LOG_APPEND_RETRY_BASE_DELAY_MS * 2 ** (attempt - 1);
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }
  }

  async recordEvent(event: AgentEvent): Promise<void> {
    if (!this.posthogAPI || !this.runId || !this.taskId) {
      return;
    }

    // Skip raw SDK events - too verbose for persistence
    if (event.type === "raw_sdk_event") {
      return;
    }

    // Batch tokens for efficiency
    if (event.type === "token") {
      this.tokenBuffer += event.content;
      this.tokenCount++;

      if (this.tokenCount >= this.TOKEN_BATCH_SIZE) {
        await this.flushTokens();
        if (this.tokenFlushTimer) {
          clearTimeout(this.tokenFlushTimer);
          this.tokenFlushTimer = undefined;
        }
      } else {
        this.scheduleTokenFlush();
      }
      return;
    }

    // Append all other events directly
    await this.appendEvent(event);
  }

  private async update(update: TaskRunUpdate, logLine?: string): Promise<void> {
    if (!this.posthogAPI || !this.runId || !this.taskId) {
      return;
    }

    // If there's a log line, append it as a console event
    if (logLine && logLine !== this.lastLogEntry) {
      const consoleEvent: ConsoleEvent = {
        type: "console",
        ts: Date.now(),
        level: "info",
        message: logLine,
      };
      try {
        await this.posthogAPI.appendTaskRunLog(this.taskId, this.runId, [
          consoleEvent,
        ]);
        this.lastLogEntry = logLine;
      } catch (error) {
        this.logger.warn("Failed to append console event", {
          taskId: this.taskId,
          runId: this.runId,
          error: (error as Error).message,
        });
      }
    }

    // Update other fields if provided
    if (Object.keys(update).length > 0) {
      try {
        const run = await this.posthogAPI.updateTaskRun(
          this.taskId,
          this.runId,
          update,
        );
        this.taskRun = run;
      } catch (error) {
        this.logger.warn("Failed to update task run", {
          taskId: this.taskId,
          runId: this.runId,
          error: (error as Error).message,
        });
      }
    }
  }
}
