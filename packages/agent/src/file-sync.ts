/**
 * FileSyncManager - Bidirectional file synchronization for cloud sessions
 *
 * When running in cloud mode:
 * - Monitors file changes from the agent (Edit, Write tools)
 * - Uploads changed files to S3 via PostHog API
 * - Publishes file change events to clients
 *
 * When receiving sync events (client side):
 * - Downloads files from S3
 * - Applies changes to local filesystem
 */

import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import type { PostHogAPIClient } from "./posthog-api.js";
import { Logger } from "./utils/logger.js";

export interface FileChangeEvent {
  type: "file_created" | "file_modified" | "file_deleted";
  path: string;
  relativePath: string;
  contentHash?: string;
  storagePath?: string;
  size?: number;
}

export interface FileSyncConfig {
  workingDirectory: string;
  taskId: string;
  runId: string;
  apiClient: PostHogAPIClient;
  onFileChange?: (event: FileChangeEvent) => Promise<void>;
}

export interface SyncedFile {
  relativePath: string;
  storagePath: string;
  contentHash: string;
  size: number;
  syncedAt: string;
}

export class FileSyncManager {
  private config: FileSyncConfig;
  private logger: Logger;
  private syncedFiles = new Map<string, SyncedFile>();
  private pendingUploads = new Map<string, Promise<void>>();

  constructor(config: FileSyncConfig) {
    this.config = config;
    this.logger = new Logger({ debug: true, prefix: "[FileSync]" });
  }

  /**
   * Called when the agent writes or edits a file in cloud mode.
   * Uploads the file to S3 and publishes a change event.
   */
  async onFileWritten(absolutePath: string): Promise<FileChangeEvent | null> {
    const relativePath = this.getRelativePath(absolutePath);
    if (!relativePath) {
      this.logger.warn("File outside working directory", { absolutePath });
      return null;
    }

    // Debounce uploads for the same file
    const existing = this.pendingUploads.get(relativePath);
    if (existing) {
      await existing;
    }

    const uploadPromise = this.uploadFile(absolutePath, relativePath);
    this.pendingUploads.set(relativePath, uploadPromise);

    try {
      await uploadPromise;
      return this.createFileEvent(absolutePath, relativePath, "file_modified");
    } finally {
      this.pendingUploads.delete(relativePath);
    }
  }

  /**
   * Called when the agent creates a new file in cloud mode.
   */
  async onFileCreated(absolutePath: string): Promise<FileChangeEvent | null> {
    const relativePath = this.getRelativePath(absolutePath);
    if (!relativePath) {
      return null;
    }

    await this.uploadFile(absolutePath, relativePath);
    return this.createFileEvent(absolutePath, relativePath, "file_created");
  }

  /**
   * Called when the agent deletes a file in cloud mode.
   */
  async onFileDeleted(absolutePath: string): Promise<FileChangeEvent | null> {
    const relativePath = this.getRelativePath(absolutePath);
    if (!relativePath) {
      return null;
    }

    this.syncedFiles.delete(relativePath);

    return {
      type: "file_deleted",
      path: absolutePath,
      relativePath,
    };
  }

  /**
   * Upload a file to S3 via the PostHog artifacts API.
   */
  private async uploadFile(
    absolutePath: string,
    relativePath: string,
  ): Promise<void> {
    try {
      const content = await fs.readFile(absolutePath, "utf8");
      const contentHash = this.computeHash(content);

      // Check if file has changed since last sync
      const existing = this.syncedFiles.get(relativePath);
      if (existing && existing.contentHash === contentHash) {
        this.logger.debug("File unchanged, skipping upload", { relativePath });
        return;
      }

      this.logger.info("Uploading file", {
        relativePath,
        size: content.length,
      });

      const artifacts = await this.config.apiClient.uploadTaskArtifacts(
        this.config.taskId,
        this.config.runId,
        [
          {
            name: `sync/${relativePath}`,
            type: "artifact",
            content,
            content_type: this.inferContentType(relativePath),
          },
        ],
      );

      if (artifacts.length > 0) {
        const artifact = artifacts[0];
        this.syncedFiles.set(relativePath, {
          relativePath,
          storagePath: artifact.storage_path ?? "",
          contentHash,
          size: content.length,
          syncedAt: new Date().toISOString(),
        });

        this.logger.info("File uploaded", {
          relativePath,
          storagePath: artifact.storage_path,
        });
      }
    } catch (error) {
      this.logger.error("Failed to upload file", { relativePath, error });
      throw error;
    }
  }

  /**
   * Download and apply a file from a sync event (client side).
   */
  async applyFileChange(event: FileChangeEvent): Promise<void> {
    const absolutePath = join(this.config.workingDirectory, event.relativePath);

    if (event.type === "file_deleted") {
      await this.deleteFileLocally(absolutePath);
      return;
    }

    if (!event.storagePath) {
      this.logger.warn("No storage path in file event", { event });
      return;
    }

    await this.downloadAndWriteFile(absolutePath, event.storagePath);
  }

  /**
   * Download a file from S3 and write it locally.
   */
  private async downloadAndWriteFile(
    absolutePath: string,
    storagePath: string,
  ): Promise<void> {
    try {
      // Get presigned URL for the file
      const presignedUrl = await this.config.apiClient.getArtifactPresignedUrl(
        this.config.taskId,
        this.config.runId,
        storagePath,
      );

      if (!presignedUrl) {
        this.logger.error("Failed to get presigned URL", { storagePath });
        return;
      }

      // Download the file
      const response = await fetch(presignedUrl);
      if (!response.ok) {
        throw new Error(`Download failed: ${response.status}`);
      }

      const content = await response.text();

      // Ensure directory exists
      await fs.mkdir(dirname(absolutePath), { recursive: true });

      // Write file
      await fs.writeFile(absolutePath, content, "utf8");

      this.logger.info("File synced locally", {
        absolutePath,
        size: content.length,
      });
    } catch (error) {
      this.logger.error("Failed to download file", { absolutePath, error });
      throw error;
    }
  }

  /**
   * Delete a file locally.
   */
  private async deleteFileLocally(absolutePath: string): Promise<void> {
    try {
      await fs.unlink(absolutePath);
      this.logger.info("File deleted locally", { absolutePath });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        throw error;
      }
    }
  }

  /**
   * Create a file change event with metadata.
   */
  private async createFileEvent(
    absolutePath: string,
    relativePath: string,
    type: FileChangeEvent["type"],
  ): Promise<FileChangeEvent> {
    const synced = this.syncedFiles.get(relativePath);

    return {
      type,
      path: absolutePath,
      relativePath,
      contentHash: synced?.contentHash,
      storagePath: synced?.storagePath,
      size: synced?.size,
    };
  }

  /**
   * Get the relative path from working directory.
   */
  private getRelativePath(absolutePath: string): string | null {
    const resolved = resolve(absolutePath);
    const workDir = resolve(this.config.workingDirectory);

    if (!resolved.startsWith(workDir)) {
      return null;
    }

    return relative(workDir, resolved);
  }

  /**
   * Compute SHA256 hash of content.
   */
  private computeHash(content: string): string {
    return createHash("sha256").update(content).digest("hex");
  }

  /**
   * Infer content type from file extension.
   */
  private inferContentType(filePath: string): string {
    const ext = filePath.split(".").pop()?.toLowerCase();
    const contentTypes: Record<string, string> = {
      ts: "text/typescript",
      tsx: "text/typescript",
      js: "text/javascript",
      jsx: "text/javascript",
      json: "application/json",
      md: "text/markdown",
      py: "text/x-python",
      rs: "text/x-rust",
      go: "text/x-go",
      java: "text/x-java",
      css: "text/css",
      html: "text/html",
      xml: "application/xml",
      yaml: "text/yaml",
      yml: "text/yaml",
      txt: "text/plain",
    };
    return contentTypes[ext ?? ""] ?? "text/plain";
  }

  /**
   * Get all synced files.
   */
  getSyncedFiles(): SyncedFile[] {
    return Array.from(this.syncedFiles.values());
  }

  /**
   * Clear sync state (e.g., when switching modes).
   */
  clear(): void {
    this.syncedFiles.clear();
    this.pendingUploads.clear();
  }
}
