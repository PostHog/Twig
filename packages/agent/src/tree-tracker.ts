/**
 * TreeTracker - Git tree-based state capture for cloud/local sync
 *
 * Instead of tracking individual file changes, TreeTracker captures the entire
 * working state as a git tree hash + archive. This provides:
 * - Atomic state snapshots (no partial syncs)
 * - Efficient delta detection using git's diffing
 * - Simpler resume logic (restore tree, continue)
 *
 * Tree snapshots are emitted as `_posthog/tree_snapshot` events in the log.
 */

import { exec } from "node:child_process";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { basename, dirname, join, relative } from "node:path";
import { promisify } from "node:util";
import { createGzip, createGunzip } from "node:zlib";
import { pipeline } from "node:stream/promises";
import * as tar from "tar";
import type { PostHogAPIClient } from "./posthog-api.js";
import { Logger } from "./utils/logger.js";

const execAsync = promisify(exec);

export interface TreeSnapshot {
  treeHash: string;
  baseCommit: string | null;
  archiveUrl?: string;
  filesChanged: string[];
  timestamp: string;
  interrupted?: boolean;
}

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
  private lastCaptureTime: number = 0;
  private captureIntervalMs: number = 5 * 60 * 1000; // 5 minutes default

  constructor(config: TreeTrackerConfig) {
    this.repositoryPath = config.repositoryPath;
    this.taskId = config.taskId;
    this.runId = config.runId;
    this.apiClient = config.apiClient;
    this.logger =
      config.logger || new Logger({ debug: false, prefix: "[TreeTracker]" });
  }

  /**
   * Check if working tree has changes since last snapshot.
   * Uses git diff-index to compare working tree against last captured tree.
   */
  async hasChanges(): Promise<boolean> {
    if (!this.lastTreeHash) {
      // No previous snapshot - check for any uncommitted changes
      const hasUncommitted = await this.hasUncommittedChanges();
      return hasUncommitted;
    }

    try {
      // Compare current working tree against last captured tree
      const { stdout } = await execAsync(
        `git diff-tree --no-commit-id --name-only -r ${this.lastTreeHash} HEAD`,
        { cwd: this.repositoryPath },
      );

      if (stdout.trim()) {
        return true;
      }

      // Also check for uncommitted changes
      return await this.hasUncommittedChanges();
    } catch (error) {
      this.logger.warn("Failed to check for changes", { error });
      return true; // Assume changes on error
    }
  }

  /**
   * Check for uncommitted changes in working directory.
   */
  private async hasUncommittedChanges(): Promise<boolean> {
    try {
      // Check for staged and unstaged changes, plus untracked files
      const { stdout: statusOutput } = await execAsync(
        "git status --porcelain",
        { cwd: this.repositoryPath },
      );

      const changes = statusOutput
        .split("\n")
        .filter((line) => line.trim() && !line.includes(".posthog/"));

      return changes.length > 0;
    } catch {
      return false;
    }
  }

  /**
   * Capture current working tree state as a snapshot.
   * Creates a git tree object and optionally uploads an archive.
   */
  async captureTree(options?: {
    interrupted?: boolean;
  }): Promise<TreeSnapshot | null> {
    try {
      // Stage all changes to create a proper tree
      await execAsync("git add -A", { cwd: this.repositoryPath });

      // Get the tree hash from the index
      const { stdout: treeHashOutput } = await execAsync("git write-tree", {
        cwd: this.repositoryPath,
      });
      const treeHash = treeHashOutput.trim();

      // Skip if no changes since last capture
      if (treeHash === this.lastTreeHash) {
        this.logger.debug("No changes since last capture", { treeHash });
        return null;
      }

      // Get the current HEAD commit as base
      let baseCommit: string | null = null;
      try {
        const { stdout: commitOutput } = await execAsync("git rev-parse HEAD", {
          cwd: this.repositoryPath,
        });
        baseCommit = commitOutput.trim();
      } catch {
        // No commits yet
      }

      // Get list of changed files
      const filesChanged = await this.getChangedFiles(this.lastTreeHash);

      // Create snapshot object
      const snapshot: TreeSnapshot = {
        treeHash,
        baseCommit,
        filesChanged,
        timestamp: new Date().toISOString(),
        interrupted: options?.interrupted,
      };

      // Upload archive if API client configured
      if (this.apiClient && filesChanged.length > 0) {
        const archiveUrl = await this.uploadTreeArchive(treeHash, filesChanged);
        if (archiveUrl) {
          snapshot.archiveUrl = archiveUrl;
        }
      }

      this.lastTreeHash = treeHash;
      this.lastCaptureTime = Date.now();

      this.logger.info("Tree captured", {
        treeHash,
        filesChanged: filesChanged.length,
        interrupted: options?.interrupted,
      });

      return snapshot;
    } catch (error) {
      this.logger.error("Failed to capture tree", { error });
      throw error;
    }
  }

  /**
   * Get list of files changed since last snapshot.
   */
  private async getChangedFiles(
    previousTreeHash: string | null,
  ): Promise<string[]> {
    const files: string[] = [];

    try {
      if (previousTreeHash) {
        // Diff against previous tree
        const { stdout } = await execAsync(
          `git diff-tree --no-commit-id --name-only -r ${previousTreeHash} HEAD`,
          { cwd: this.repositoryPath },
        );
        files.push(
          ...stdout
            .split("\n")
            .filter((f) => f.trim() && !f.includes(".posthog/")),
        );
      } else {
        // No previous tree - get all staged files
        const { stdout } = await execAsync(
          "git diff --cached --name-only HEAD",
          { cwd: this.repositoryPath },
        );
        files.push(
          ...stdout
            .split("\n")
            .filter((f) => f.trim() && !f.includes(".posthog/")),
        );
      }

      // Also get unstaged and untracked files
      const { stdout: statusOutput } = await execAsync(
        "git status --porcelain",
        { cwd: this.repositoryPath },
      );

      for (const line of statusOutput.split("\n")) {
        if (!line.trim() || line.includes(".posthog/")) continue;
        const filePath = line.slice(3).trim();
        if (filePath && !files.includes(filePath)) {
          files.push(filePath);
        }
      }
    } catch (error) {
      this.logger.warn("Failed to get changed files", { error });
    }

    return files;
  }

  /**
   * Create and upload a tar.gz archive of changed files.
   */
  private async uploadTreeArchive(
    treeHash: string,
    filesChanged: string[],
  ): Promise<string | null> {
    if (!this.apiClient || filesChanged.length === 0) {
      return null;
    }

    const tmpDir = join(this.repositoryPath, ".posthog", "tmp");
    const archivePath = join(tmpDir, `${treeHash}.tar.gz`);

    try {
      await mkdir(tmpDir, { recursive: true });

      // Create tar.gz archive of changed files
      await tar.create(
        {
          gzip: true,
          file: archivePath,
          cwd: this.repositoryPath,
        },
        filesChanged.filter((f) => {
          // Only include files that exist
          try {
            const filePath = join(this.repositoryPath, f);
            return require("node:fs").existsSync(filePath);
          } catch {
            return false;
          }
        }),
      );

      // Read archive and upload
      const archiveContent = await readFile(archivePath);
      const base64Content = archiveContent.toString("base64");

      const artifacts = await this.apiClient.uploadTaskArtifacts(
        this.taskId,
        this.runId,
        [
          {
            name: `trees/${treeHash}.tar.gz`,
            type: "artifact",
            content: base64Content,
            content_type: "application/gzip",
          },
        ],
      );

      // Clean up temp file
      await rm(archivePath, { force: true });

      if (artifacts.length > 0) {
        return artifacts[0].storage_path ?? null;
      }
    } catch (error) {
      this.logger.warn("Failed to upload tree archive", { error });
      // Clean up on error
      try {
        await rm(archivePath, { force: true });
      } catch {
        // Ignore cleanup errors
      }
    }

    return null;
  }

  /**
   * Download and apply a tree archive from a snapshot.
   */
  async applyTreeSnapshot(snapshot: TreeSnapshot): Promise<void> {
    if (!snapshot.archiveUrl || !this.apiClient) {
      this.logger.warn("No archive URL or API client for snapshot");
      return;
    }

    const tmpDir = join(this.repositoryPath, ".posthog", "tmp");
    const archivePath = join(tmpDir, `${snapshot.treeHash}.tar.gz`);

    try {
      await mkdir(tmpDir, { recursive: true });

      // Get presigned URL for download
      const presignedUrl = await this.apiClient.getArtifactPresignedUrl(
        this.taskId,
        this.runId,
        snapshot.archiveUrl,
      );

      if (!presignedUrl) {
        throw new Error("Failed to get presigned URL for tree archive");
      }

      // Download archive
      const response = await fetch(presignedUrl);
      if (!response.ok) {
        throw new Error(`Download failed: ${response.status}`);
      }

      const arrayBuffer = await response.arrayBuffer();
      await writeFile(archivePath, Buffer.from(arrayBuffer));

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

      this.lastTreeHash = snapshot.treeHash;

      this.logger.info("Tree snapshot applied", {
        treeHash: snapshot.treeHash,
        filesChanged: snapshot.filesChanged.length,
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
