/**
 * TreeTracker - Git tree-based state capture for cloud/local sync
 *
 * Captures the entire working state as a git tree hash + archive:
 * - Atomic state snapshots (no partial syncs)
 * - Efficient delta detection using git's diffing
 * - Simpler resume logic (restore tree, continue)
 *
 * Uses Saga pattern for atomic operations with automatic rollback on failure.
 * Uses a temporary git index to avoid modifying the user's staging area.
 */

import type { PostHogAPIClient } from "./posthog-api.js";
import { ApplySnapshotSaga } from "./sagas/apply-snapshot-saga.js";
import { CaptureTreeSaga } from "./sagas/capture-tree-saga.js";
import type { TreeSnapshot } from "./types.js";
import { Logger } from "./utils/logger.js";

export type { TreeSnapshot };

export interface TreeTrackerConfig {
  repositoryPath: string;
  taskId: string;
  runId: string;
  apiClient?: PostHogAPIClient;
  logger?: Logger;
}

export class TreeTracker {
  private repositoryPath: string;
  private taskId: string;
  private runId: string;
  private apiClient?: PostHogAPIClient;
  private logger: Logger;
  private lastTreeHash: string | null = null;

  constructor(config: TreeTrackerConfig) {
    this.repositoryPath = config.repositoryPath;
    this.taskId = config.taskId;
    this.runId = config.runId;
    this.apiClient = config.apiClient;
    this.logger =
      config.logger || new Logger({ debug: false, prefix: "[TreeTracker]" });
  }

  /**
   * Capture current working tree state as a snapshot.
   * Uses a temporary index to avoid modifying user's staging area.
   * Uses Saga pattern for atomic operation with automatic cleanup on failure.
   */
  async captureTree(options?: {
    interrupted?: boolean;
  }): Promise<TreeSnapshot | null> {
    const saga = new CaptureTreeSaga(this.logger);

    const result = await saga.run({
      repositoryPath: this.repositoryPath,
      taskId: this.taskId,
      runId: this.runId,
      apiClient: this.apiClient,
      lastTreeHash: this.lastTreeHash,
      interrupted: options?.interrupted,
    });

    if (!result.success) {
      this.logger.error("Failed to capture tree", {
        error: result.error,
        failedStep: result.failedStep,
      });
      throw new Error(`Failed to capture tree at step '${result.failedStep}': ${result.error}`);
    }

    // Only update lastTreeHash on success
    if (result.data.newTreeHash !== null) {
      this.lastTreeHash = result.data.newTreeHash;
    }

    return result.data.snapshot;
  }

  /**
   * Download and apply a tree snapshot.
   * Uses Saga pattern for atomic operation with rollback on failure.
   */
  async applyTreeSnapshot(snapshot: TreeSnapshot): Promise<void> {
    if (!this.apiClient) {
      throw new Error("Cannot apply snapshot: API client not configured");
    }

    if (!snapshot.archiveUrl) {
      this.logger.warn("Cannot apply snapshot: no archive URL", {
        treeHash: snapshot.treeHash,
        changes: snapshot.changes.length,
      });
      throw new Error("Cannot apply snapshot: no archive URL");
    }

    const saga = new ApplySnapshotSaga(this.logger);

    const result = await saga.run({
      snapshot,
      repositoryPath: this.repositoryPath,
      apiClient: this.apiClient,
      taskId: this.taskId,
      runId: this.runId,
    });

    if (!result.success) {
      this.logger.error("Failed to apply tree snapshot", {
        error: result.error,
        failedStep: result.failedStep,
        treeHash: snapshot.treeHash,
      });
      throw new Error(`Failed to apply snapshot at step '${result.failedStep}': ${result.error}`);
    }

    // Only update lastTreeHash on success
    this.lastTreeHash = result.data.treeHash;
  }

  /**
   * Get the last captured tree hash.
   */
  getLastTreeHash(): string | null {
    return this.lastTreeHash;
  }

  /**
   * Set the last tree hash (used when resuming).
   */
  setLastTreeHash(hash: string | null): void {
    this.lastTreeHash = hash;
  }
}
