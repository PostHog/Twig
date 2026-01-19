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
 *
 * Cloud/Local Handoff:
 * - syncFilesToS3(): Upload local changes when switching to cloud
 * - applyManifest(): Apply cloud changes when switching to local
 */

import { exec } from "node:child_process";
import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { promisify } from "node:util";
import type { PostHogAPIClient } from "./posthog-api.js";
import type { FileManifest, FileManifestEntry } from "./types.js";
import { Logger } from "./utils/logger.js";

const execAsync = promisify(exec);

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

  /**
   * Get files that have changed since a base commit.
   * If no base commit is provided, returns all tracked files.
   */
  async getChangedFiles(
    repoPath: string,
    baseCommit?: string | null,
  ): Promise<Array<{ path: string; status: "added" | "modified" | "deleted" }>> {
    const changedFiles: Array<{
      path: string;
      status: "added" | "modified" | "deleted";
    }> = [];

    try {
      let diffOutput: string;

      if (baseCommit) {
        const { stdout } = await execAsync(
          `git diff --name-status ${baseCommit} HEAD`,
          { cwd: repoPath },
        );
        diffOutput = stdout;
      } else {
        const { stdout } = await execAsync("git diff --name-status HEAD~1 HEAD", {
          cwd: repoPath,
        });
        diffOutput = stdout;
      }

      for (const line of diffOutput.trim().split("\n")) {
        if (!line) continue;
        const [statusCode, ...pathParts] = line.split("\t");
        const filePath = pathParts.join("\t");

        let status: "added" | "modified" | "deleted";
        switch (statusCode?.[0]) {
          case "A":
            status = "added";
            break;
          case "D":
            status = "deleted";
            break;
          default:
            status = "modified";
        }

        changedFiles.push({ path: filePath, status });
      }

      // Also include untracked files
      const { stdout: untrackedOutput } = await execAsync(
        "git ls-files --others --exclude-standard",
        { cwd: repoPath },
      );

      for (const line of untrackedOutput.trim().split("\n")) {
        if (line) {
          changedFiles.push({ path: line, status: "added" });
        }
      }

      // Include modified but not yet committed files
      const { stdout: stagedOutput } = await execAsync(
        "git diff --name-status",
        { cwd: repoPath },
      );

      for (const line of stagedOutput.trim().split("\n")) {
        if (!line) continue;
        const [statusCode, ...pathParts] = line.split("\t");
        const filePath = pathParts.join("\t");

        if (!changedFiles.some((f) => f.path === filePath)) {
          let status: "added" | "modified" | "deleted";
          switch (statusCode?.[0]) {
            case "A":
              status = "added";
              break;
            case "D":
              status = "deleted";
              break;
            default:
              status = "modified";
          }
          changedFiles.push({ path: filePath, status });
        }
      }
    } catch (error) {
      this.logger.error("Failed to get changed files", { error });
    }

    return changedFiles;
  }

  /**
   * Sync all changed files to S3 and create/update the file manifest.
   * Called when switching from local to cloud mode.
   */
  async syncFilesToS3(
    repoPath: string,
    baseCommit?: string | null,
  ): Promise<FileManifest> {
    this.logger.info("Syncing files to S3", { repoPath, baseCommit });

    const changedFiles = await this.getChangedFiles(repoPath, baseCommit);
    const files: Record<string, FileManifestEntry> = {};
    const deletedFiles: string[] = [];

    for (const { path: filePath, status } of changedFiles) {
      if (status === "deleted") {
        deletedFiles.push(filePath);
        continue;
      }

      const absolutePath = join(repoPath, filePath);

      try {
        const content = await fs.readFile(absolutePath, "utf8");
        const hash = this.computeHash(content);

        // Upload file by hash (content-addressed storage)
        await this.config.apiClient.uploadTaskArtifacts(
          this.config.taskId,
          this.config.runId,
          [
            {
              name: `files/${hash}`,
              type: "artifact",
              content,
              content_type: this.inferContentType(filePath),
            },
          ],
        );

        files[filePath] = {
          hash,
          size: Buffer.byteLength(content, "utf8"),
        };

        this.logger.debug("Uploaded file", { filePath, hash });
      } catch (error) {
        this.logger.error("Failed to upload file", { filePath, error });
      }
    }

    const manifest: FileManifest = {
      version: 1,
      base_commit: baseCommit || null,
      updated_at: new Date().toISOString(),
      files,
      deleted_files: deletedFiles,
    };

    // Store the manifest
    await this.config.apiClient.putFileManifest(
      this.config.taskId,
      this.config.runId,
      manifest,
    );

    this.logger.info("File manifest uploaded", {
      fileCount: Object.keys(files).length,
      deletedCount: deletedFiles.length,
    });

    return manifest;
  }

  /**
   * Apply a file manifest to the local filesystem.
   * Called when switching from cloud to local mode.
   */
  async applyManifest(
    manifest: FileManifest,
    repoPath: string,
  ): Promise<void> {
    this.logger.info("Applying file manifest", {
      fileCount: Object.keys(manifest.files).length,
      deletedCount: manifest.deleted_files.length,
    });

    // Apply file changes
    for (const [relativePath, meta] of Object.entries(manifest.files)) {
      const localPath = join(repoPath, relativePath);

      try {
        // Check if local file already has same content
        const localHash = await this.computeFileHash(localPath).catch(
          () => null,
        );

        if (localHash === meta.hash) {
          this.logger.debug("File unchanged, skipping", { relativePath });
          continue;
        }

        // Download file by hash
        const storagePath = `files/${meta.hash}`;
        const presignedUrl = await this.config.apiClient.getArtifactPresignedUrl(
          this.config.taskId,
          this.config.runId,
          storagePath,
        );

        if (!presignedUrl) {
          // Try alternative path format
          const altStoragePath = `sync/${relativePath}`;
          const altUrl = await this.config.apiClient.getArtifactPresignedUrl(
            this.config.taskId,
            this.config.runId,
            altStoragePath,
          );

          if (!altUrl) {
            this.logger.error("Could not find file in S3", { relativePath });
            continue;
          }

          await this.downloadAndWriteFile(localPath, altStoragePath);
        } else {
          const response = await fetch(presignedUrl);
          if (!response.ok) {
            throw new Error(`Download failed: ${response.status}`);
          }

          const content = await response.text();

          await fs.mkdir(dirname(localPath), { recursive: true });
          await fs.writeFile(localPath, content, "utf8");

          this.logger.debug("Applied file", { relativePath });
        }
      } catch (error) {
        this.logger.error("Failed to apply file", { relativePath, error });
      }
    }

    // Apply deletions
    for (const deletedPath of manifest.deleted_files) {
      const localPath = join(repoPath, deletedPath);
      try {
        await fs.unlink(localPath);
        this.logger.debug("Deleted file", { deletedPath });
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
          this.logger.error("Failed to delete file", { deletedPath, error });
        }
      }
    }

    this.logger.info("File manifest applied");
  }

  /**
   * Compute hash of a local file.
   */
  private async computeFileHash(filePath: string): Promise<string> {
    const content = await fs.readFile(filePath, "utf8");
    return this.computeHash(content);
  }
}
