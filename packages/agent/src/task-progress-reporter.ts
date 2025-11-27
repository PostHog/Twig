import type { PostHogAPIClient, TaskRunUpdate } from "./posthog-api.js";
import type { AgentEvent, LogEntry, TaskRun } from "./types.js";
import type { Logger } from "./utils/logger.js";

interface ProgressMetadata {
  totalSteps?: number;
}

/**
 * Persists task execution progress to PostHog so clients can poll for updates.
 *
 * The reporter is intentionally best-effort – failures are logged but never
 * allowed to break the agent execution flow.
 */
export class TaskProgressReporter {
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
    this.logger = logger.child("TaskProgressReporter");
  }

  get runId(): string | undefined {
    return this.taskRun?.id;
  }

  async start(taskId: string, metadata: ProgressMetadata = {}): Promise<void> {
    if (!this.posthogAPI) {
      return;
    }

    this.taskId = taskId;
    this.totalSteps = metadata.totalSteps;

    try {
      const run = await this.posthogAPI.createTaskRun(taskId, {
        status: "started",
      });
      this.taskRun = run;
      this.logger.debug("Created task run", { taskId, runId: run.id });
    } catch (error) {
      this.logger.warn("Failed to create task run", {
        taskId,
        error: (error as Error).message,
      });
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

    await this.appendLogEntry({
      type: "token",
      message: buffer,
    });
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

  private appendLogEntry(entry: LogEntry): Promise<void> {
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
      .then(() => this.writeLogEntry(taskId, runId, entry));

    return this.logWriteQueue;
  }

  private async writeLogEntry(
    taskId: string,
    runId: string,
    entry: LogEntry,
  ): Promise<void> {
    if (!this.posthogAPI) {
      return;
    }

    for (let attempt = 1; attempt <= this.LOG_APPEND_MAX_RETRIES; attempt++) {
      try {
        await this.posthogAPI.appendTaskRunLog(taskId, runId, [entry]);
        return;
      } catch (error) {
        this.logger.warn("Failed to append log entry", {
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

    switch (event.type) {
      case "token": {
        // Batch tokens for efficiency
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

      case "content_block_start": {
        await this.appendLogEntry({
          type: "content_block_start",
          message: JSON.stringify({
            index: event.index,
            contentType: event.contentType,
            toolName: event.toolName,
            toolId: event.toolId,
            ts: event.ts,
          }),
        });
        return;
      }

      case "content_block_stop": {
        await this.appendLogEntry({
          type: "content_block_stop",
          message: JSON.stringify({
            index: event.index,
            ts: event.ts,
          }),
        });
        return;
      }

      case "message_start": {
        await this.appendLogEntry({
          type: "message_start",
          message: JSON.stringify({
            messageId: event.messageId,
            model: event.model,
            ts: event.ts,
          }),
        });
        return;
      }

      case "message_delta": {
        await this.appendLogEntry({
          type: "message_delta",
          message: JSON.stringify({
            stopReason: event.stopReason,
            stopSequence: event.stopSequence,
            usage: event.usage,
            ts: event.ts,
          }),
        });
        return;
      }

      case "message_stop": {
        await this.appendLogEntry({
          type: "message_stop",
          message: JSON.stringify({ ts: event.ts }),
        });
        return;
      }

      case "status": {
        await this.appendLogEntry({
          type: "status",
          message: JSON.stringify({
            phase: event.phase,
            kind: event.kind,
            branch: event.branch,
            prUrl: event.prUrl,
            taskId: event.taskId,
            messageId: event.messageId,
            model: event.model,
            ts: event.ts,
          }),
        });
        return;
      }

      case "artifact": {
        await this.appendLogEntry({
          type: "artifact",
          message: JSON.stringify({
            kind: event.kind,
            content: event.content,
            ts: event.ts,
          }),
        });
        return;
      }

      case "init": {
        await this.appendLogEntry({
          type: "init",
          message: JSON.stringify({
            model: event.model,
            tools: event.tools,
            permissionMode: event.permissionMode,
            cwd: event.cwd,
            apiKeySource: event.apiKeySource,
            ts: event.ts,
          }),
        });
        return;
      }

      case "metric": {
        await this.appendLogEntry({
          type: "metric",
          message: JSON.stringify({
            key: event.key,
            value: event.value,
            unit: event.unit,
            ts: event.ts,
          }),
        });
        return;
      }

      case "compact_boundary": {
        await this.appendLogEntry({
          type: "compact_boundary",
          message: JSON.stringify({
            trigger: event.trigger,
            preTokens: event.preTokens,
            ts: event.ts,
          }),
        });
        return;
      }

      case "tool_call": {
        await this.appendLogEntry({
          type: "tool_call",
          message: JSON.stringify({
            toolName: event.toolName,
            callId: event.callId,
            args: event.args,
            parentToolUseId: event.parentToolUseId,
            ts: event.ts,
          }),
        });
        return;
      }

      case "tool_result": {
        await this.appendLogEntry({
          type: "tool_result",
          message: JSON.stringify({
            toolName: event.toolName,
            callId: event.callId,
            result: event.result,
            isError: event.isError,
            parentToolUseId: event.parentToolUseId,
            ts: event.ts,
          }),
        });
        return;
      }

      case "error": {
        await this.appendLogEntry({
          type: "error",
          message: JSON.stringify({
            message: event.message,
            errorType: event.errorType,
            context: event.context,
            ts: event.ts,
          }),
        });
        return;
      }

      case "done": {
        await this.appendLogEntry({
          type: "done",
          message: JSON.stringify({
            result: event.result,
            durationMs: event.durationMs,
            durationApiMs: event.durationApiMs,
            numTurns: event.numTurns,
            totalCostUsd: event.totalCostUsd,
            usage: event.usage,
            modelUsage: event.modelUsage,
            permissionDenials: event.permissionDenials,
            ts: event.ts,
          }),
        });
        return;
      }

      case "user_message": {
        await this.appendLogEntry({
          type: "user_message",
          message: JSON.stringify({
            content: event.content,
            isSynthetic: event.isSynthetic,
            ts: event.ts,
          }),
        });
        return;
      }

      case "raw_sdk_event": {
        // Skip raw SDK events - too verbose for persistence
        return;
      }

      default:
        // For any unfamiliar event types, log them as-is
        this.logger.debug("Unknown event type", {
          type: (event as { type: string }).type,
        });
        return;
    }
  }

  private async update(update: TaskRunUpdate, logLine?: string): Promise<void> {
    if (!this.posthogAPI || !this.runId || !this.taskId) {
      return;
    }

    // If there's a log line, append it separately using the append_log endpoint
    if (logLine && logLine !== this.lastLogEntry) {
      try {
        await this.posthogAPI.appendTaskRunLog(this.taskId, this.runId, [
          { type: "info", message: logLine },
        ]);
        this.lastLogEntry = logLine;
      } catch (error) {
        this.logger.warn("Failed to append log entry", {
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
