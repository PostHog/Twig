import type { StoredLogEntry } from "@shared/types/session-events.js";
import { net } from "electron";
import { injectable, preDestroy } from "inversify";
import { logger } from "../../lib/logger.js";
import { TypedEventEmitter } from "../../lib/typed-event-emitter.js";
import {
  CloudTaskEvent,
  type CloudTaskEvents,
  type TaskRunStatus,
  TERMINAL_STATUSES,
  type WatchInput,
} from "./schemas.js";

const log = logger.scope("cloud-task");

const LOG_POLL_INTERVAL_MS = 5_000;
const STATUS_POLL_INTERVAL_MS = 10_000;

interface TaskRunResponse {
  id: string;
  status: TaskRunStatus;
  stage?: string | null;
  output?: Record<string, unknown> | null;
  error_message?: string | null;
  branch?: string | null;
}

interface WatcherState {
  taskId: string;
  runId: string;
  apiHost: string;
  teamId: number;
  pollTimeoutId: ReturnType<typeof setTimeout> | null;
  processedLogCount: number;
  lastLogCursor: string | null;
  lastCursorSeenCount: number;
  lastStatus: TaskRunStatus | null;
  lastStage: string | null;
  lastOutput: Record<string, unknown> | null;
  lastErrorMessage: string | null;
  lastBranch: string | null;
  lastStatusPollTime: number;
  subscriberCount: number;
}

interface PendingWatchState {
  input: WatchInput;
  subscriberCount: number;
}

function watcherKey(taskId: string, runId: string): string {
  return `${taskId}:${runId}`;
}

@injectable()
export class CloudTaskService extends TypedEventEmitter<CloudTaskEvents> {
  private watchers = new Map<string, WatcherState>();
  private pendingWatches = new Map<string, PendingWatchState>();
  private apiKey: string | null = null;

  watch(input: WatchInput): void {
    const key = watcherKey(input.taskId, input.runId);

    // If watcher already exists, increment subscriber count
    const existing = this.watchers.get(key);
    if (existing) {
      existing.subscriberCount++;
      log.info("Cloud task watcher subscriber added", {
        key,
        subscribers: existing.subscriberCount,
      });
      return;
    }

    // If no token yet, queue (deduplicated by key)
    if (!this.apiKey) {
      const pending = this.pendingWatches.get(key);
      if (pending) {
        pending.subscriberCount++;
      } else {
        this.pendingWatches.set(key, { input, subscriberCount: 1 });
      }
      log.info("Cloud task watch queued (no token yet)", { key });
      return;
    }

    this.startWatcher(input, 1);
  }

  unwatch(taskId: string, runId: string): void {
    const key = watcherKey(taskId, runId);
    const watcher = this.watchers.get(key);
    if (!watcher) {
      const pending = this.pendingWatches.get(key);
      if (!pending) return;

      pending.subscriberCount--;
      if (pending.subscriberCount <= 0) {
        this.pendingWatches.delete(key);
      }
      return;
    }

    watcher.subscriberCount--;
    if (watcher.subscriberCount <= 0) {
      this.stopWatcher(key);
    } else {
      log.info("Cloud task watcher subscriber removed", {
        key,
        subscribers: watcher.subscriberCount,
      });
    }
  }

  updateToken(token: string): void {
    this.apiKey = token;

    // Drain pending watches
    if (this.pendingWatches.size > 0) {
      const pending = [...this.pendingWatches.values()];
      this.pendingWatches.clear();
      for (const queued of pending) {
        this.startWatcher(queued.input, queued.subscriberCount);
      }
      log.info("Drained pending cloud task watches", {
        count: pending.length,
      });
    }
  }

  @preDestroy()
  unwatchAll(): void {
    for (const key of [...this.watchers.keys()]) {
      this.stopWatcher(key);
    }
    this.pendingWatches.clear();
  }

  // --- Private ---

  private startWatcher(input: WatchInput, subscriberCount: number): void {
    const key = watcherKey(input.taskId, input.runId);

    const watcher: WatcherState = {
      taskId: input.taskId,
      runId: input.runId,
      apiHost: input.apiHost,
      teamId: input.teamId,
      pollTimeoutId: null,
      processedLogCount: 0,
      lastLogCursor: null,
      lastCursorSeenCount: 0,
      lastStatus: null,
      lastStage: null,
      lastOutput: null,
      lastErrorMessage: null,
      lastBranch: null,
      lastStatusPollTime: 0,
      subscriberCount,
    };

    this.watchers.set(key, watcher);
    log.info("Cloud task watcher started", { key });

    // Immediate first poll (snapshot)
    this.poll(key, true);
  }

  private stopWatcher(key: string): void {
    const watcher = this.watchers.get(key);
    if (!watcher) return;

    if (watcher.pollTimeoutId) {
      clearTimeout(watcher.pollTimeoutId);
      watcher.pollTimeoutId = null;
    }

    this.watchers.delete(key);
    log.info("Cloud task watcher stopped", { key });
  }

  private schedulePoll(key: string): void {
    const watcher = this.watchers.get(key);
    if (!watcher) return;

    watcher.pollTimeoutId = setTimeout(() => {
      watcher.pollTimeoutId = null;
      this.poll(key, false);
    }, LOG_POLL_INTERVAL_MS);
  }

  private async poll(key: string, isSnapshot: boolean): Promise<void> {
    const watcher = this.watchers.get(key);
    if (!watcher || !this.apiKey) return;

    try {
      // Always fetch logs
      const logResult = await this.fetchLogs(watcher);

      // Fetch status if snapshot or interval elapsed
      const now = Date.now();
      const shouldFetchStatus =
        isSnapshot ||
        now - watcher.lastStatusPollTime >= STATUS_POLL_INTERVAL_MS;

      let statusResult: TaskRunResponse | null = null;
      let statusChanged = false;

      if (shouldFetchStatus) {
        statusResult = await this.fetchRunStatus(watcher);
        watcher.lastStatusPollTime = now;

        if (statusResult) {
          statusChanged =
            statusResult.status !== watcher.lastStatus ||
            statusResult.stage !== watcher.lastStage ||
            JSON.stringify(statusResult.output) !==
              JSON.stringify(watcher.lastOutput) ||
            statusResult.error_message !== watcher.lastErrorMessage ||
            statusResult.branch !== watcher.lastBranch;

          if (statusChanged) {
            watcher.lastStatus = statusResult.status;
            watcher.lastStage = statusResult.stage ?? null;
            watcher.lastOutput = statusResult.output ?? null;
            watcher.lastErrorMessage = statusResult.error_message ?? null;
            watcher.lastBranch = statusResult.branch ?? null;
          }
        }
      }

      // Determine kind and whether to emit
      const hasNewLogs = logResult.newEntries.length > 0;
      const hasStatusUpdate = statusChanged && statusResult;

      if (isSnapshot) {
        // Always emit snapshot on first poll, even if empty
        this.emit(CloudTaskEvent.Update, {
          taskId: watcher.taskId,
          runId: watcher.runId,
          kind: "snapshot",
          newEntries: logResult.newEntries,
          totalEntryCount: watcher.processedLogCount,
          status: statusResult?.status ?? watcher.lastStatus ?? undefined,
          stage: statusResult?.stage ?? watcher.lastStage,
          output: statusResult?.output ?? watcher.lastOutput,
          errorMessage: statusResult?.error_message ?? watcher.lastErrorMessage,
          branch: statusResult?.branch ?? watcher.lastBranch,
        });
      } else {
        if (hasNewLogs && hasStatusUpdate && statusResult) {
          // Both changed — emit snapshot
          this.emit(CloudTaskEvent.Update, {
            taskId: watcher.taskId,
            runId: watcher.runId,
            kind: "snapshot",
            newEntries: logResult.newEntries,
            totalEntryCount: watcher.processedLogCount,
            status: statusResult.status,
            stage: statusResult.stage ?? null,
            output: statusResult.output ?? null,
            errorMessage: statusResult.error_message ?? null,
            branch: statusResult.branch ?? null,
          });
        } else if (hasNewLogs) {
          this.emit(CloudTaskEvent.Update, {
            taskId: watcher.taskId,
            runId: watcher.runId,
            kind: "logs",
            newEntries: logResult.newEntries,
            totalEntryCount: watcher.processedLogCount,
          });
        } else if (hasStatusUpdate && statusResult) {
          this.emit(CloudTaskEvent.Update, {
            taskId: watcher.taskId,
            runId: watcher.runId,
            kind: "status",
            status: statusResult.status,
            stage: statusResult.stage ?? null,
            output: statusResult.output ?? null,
            errorMessage: statusResult.error_message ?? null,
            branch: statusResult.branch ?? null,
          });
        }
      }

      // Check for terminal status
      const currentStatus = watcher.lastStatus;
      if (
        currentStatus &&
        TERMINAL_STATUSES.includes(
          currentStatus as (typeof TERMINAL_STATUSES)[number],
        )
      ) {
        // The regular poll above already fetched logs and emitted any updates.
        // Only emit a final status event if we did NOT already emit a status or
        // snapshot update above, to ensure the renderer knows the run is terminal.
        if (!hasStatusUpdate && !isSnapshot) {
          this.emit(CloudTaskEvent.Update, {
            taskId: watcher.taskId,
            runId: watcher.runId,
            kind: "status",
            status: watcher.lastStatus ?? undefined,
            stage: watcher.lastStage,
            output: watcher.lastOutput,
            errorMessage: watcher.lastErrorMessage,
            branch: watcher.lastBranch,
          });
        }

        log.info("Cloud task reached terminal status", {
          key,
          status: currentStatus,
        });
        this.stopWatcher(key);
        return;
      }
    } catch (error) {
      log.warn("Cloud task poll error", { key, error });
    }

    // Schedule next poll (only if watcher still exists)
    if (this.watchers.has(key)) {
      this.schedulePoll(key);
    }
  }

  private async fetchLogs(
    watcher: WatcherState,
  ): Promise<{ newEntries: StoredLogEntry[] }> {
    const url = new URL(
      `${watcher.apiHost}/api/projects/${watcher.teamId}/tasks/${watcher.taskId}/runs/${watcher.runId}/session_logs/`,
    );
    url.searchParams.set("limit", "5000");
    if (watcher.lastLogCursor) {
      url.searchParams.set("after", watcher.lastLogCursor);
    }

    try {
      const response = await net.fetch(url.toString(), {
        method: "GET",
        headers: { Authorization: `Bearer ${this.apiKey}` },
      });

      if (!response.ok) {
        log.warn("Cloud task log fetch failed", {
          status: response.status,
          taskId: watcher.taskId,
        });
        return { newEntries: [] };
      }

      const entries = (await response.json()) as StoredLogEntry[];

      if (entries.length === 0) {
        return { newEntries: [] };
      }

      // Dedupe: skip entries we've already seen (guard against non-unique cursors)
      const startIndex = this.findDedupeStartIndex(entries, watcher);
      const newEntries = entries.slice(startIndex);

      if (newEntries.length > 0) {
        watcher.processedLogCount += newEntries.length;
        // Update cursor to last entry's timestamp
        const lastEntry = newEntries[newEntries.length - 1];
        const lastTimestamp = lastEntry?.timestamp;
        if (lastTimestamp) {
          if (lastTimestamp === watcher.lastLogCursor) {
            watcher.lastCursorSeenCount += newEntries.filter(
              (entry) => entry.timestamp === lastTimestamp,
            ).length;
          } else {
            watcher.lastLogCursor = lastTimestamp;
            watcher.lastCursorSeenCount = newEntries.filter(
              (entry) => entry.timestamp === lastTimestamp,
            ).length;
          }
        }
      }

      return { newEntries };
    } catch (error) {
      log.warn("Cloud task log fetch error", {
        taskId: watcher.taskId,
        error,
      });
      return { newEntries: [] };
    }
  }

  private findDedupeStartIndex(
    entries: StoredLogEntry[],
    watcher: WatcherState,
  ): number {
    // If no cursor, all entries are new
    if (!watcher.lastLogCursor) return 0;

    let seenAtCursor = 0;

    // Skip entries before cursor, then skip already-seen entries at cursor
    for (let i = 0; i < entries.length; i++) {
      const ts = entries[i]?.timestamp;
      if (!ts) {
        return i;
      }

      if (ts < watcher.lastLogCursor) {
        continue;
      }

      if (ts === watcher.lastLogCursor) {
        seenAtCursor++;
        if (seenAtCursor <= watcher.lastCursorSeenCount) {
          continue;
        }
      }

      return i;
    }
    // All entries are at or before cursor — nothing new
    return entries.length;
  }

  private async fetchRunStatus(
    watcher: WatcherState,
  ): Promise<TaskRunResponse | null> {
    const url = `${watcher.apiHost}/api/projects/${watcher.teamId}/tasks/${watcher.taskId}/runs/${watcher.runId}/`;

    try {
      const response = await net.fetch(url, {
        method: "GET",
        headers: { Authorization: `Bearer ${this.apiKey}` },
      });

      if (!response.ok) {
        log.warn("Cloud task status fetch failed", {
          status: response.status,
          taskId: watcher.taskId,
        });
        return null;
      }

      return (await response.json()) as TaskRunResponse;
    } catch (error) {
      log.warn("Cloud task status fetch error", {
        taskId: watcher.taskId,
        error,
      });
      return null;
    }
  }
}
