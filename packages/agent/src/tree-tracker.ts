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
        filesChanged: snapshot.filesChanged?.length ?? 0,
        filesDeleted: snapshot.filesDeleted?.length ?? 0,
      });
      throw new Error("Cannot apply snapshot: no archive URL");
    }

    const tmpDir = join(this.repositoryPath, ".posthog", "tmp");
    const archivePath = join(tmpDir, `${snapshot.treeHash}.tar.gz`);

    try {
      await mkdir(tmpDir, { recursive: true });

      // Download archive
      const arrayBuffer = await this.apiClient.downloadArtifact(
        this.taskId,
        this.runId,
        snapshot.archiveUrl,
      );

      if (!arrayBuffer) {
        throw new Error("Failed to download tree archive");
      }

      // Artifact content is stored as base64, decode it
      const base64Content = Buffer.from(arrayBuffer).toString("utf-8");
      const binaryContent = Buffer.from(base64Content, "base64");
      await writeFile(archivePath, binaryContent);

      // If there's a base commit, checkout to it first
      if (snapshot.baseCommit) {
        try {
          await execAsync(`git checkout ${snapshot.baseCommit}`, {
            cwd: this.repositoryPath,
          });
        } catch (error) {
          this.logger.warn("Failed to checkout base commit", {
            baseCommit: snapshot.baseCommit,
            error,
          });
        }
      }

      // Extract archive
      await tar.extract({
        file: archivePath,
        cwd: this.repositoryPath,
      });

      // Delete files that were removed during the snapshot period
      if (snapshot.filesDeleted?.length) {
        for (const filePath of snapshot.filesDeleted) {
          const fullPath = join(this.repositoryPath, filePath);
          try {
            await rm(fullPath, { force: true });
            this.logger.debug(`Deleted file: ${filePath}`);
          } catch {
            // File may not exist, which is fine
          }
        }
        this.logger.info(
          `Deleted ${snapshot.filesDeleted.length} files from snapshot`,
        );
      }

      this.lastTreeHash = snapshot.treeHash;

      this.logger.info("Tree snapshot applied", {
        treeHash: snapshot.treeHash,
        filesChanged: snapshot.filesChanged.length,
        filesDeleted: snapshot.filesDeleted?.length ?? 0,
      });

      // Clean up
      await rm(archivePath, { force: true });
    } catch (error) {
      this.logger.error("Failed to apply tree snapshot", { error });
      // Clean up on error
      try {
        await rm(archivePath, { force: true });
      } catch {
        // Ignore cleanup errors
      }
      throw error;
    }
  }

  /**
   * Check if enough time has passed for a periodic capture.
   */
  shouldCapturePerodically(): boolean {
    return Date.now() - this.lastCaptureTime >= this.captureIntervalMs;
  }

  /**
   * Set the interval for periodic captures.
   */
  setCaptureInterval(intervalMs: number): void {
    this.captureIntervalMs = intervalMs;
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
