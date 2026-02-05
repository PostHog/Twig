import { existsSync } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import * as watcher from "@parcel/watcher";
import { app } from "electron";
import { logger } from "../../../lib/logger.js";
import { TypedEventEmitter } from "../../../lib/typed-event-emitter.js";
import type { DirectoryEntry } from "../../file-watcher/schemas.js";
import type { FsService } from "../../fs/service.js";
import type { FileEntry, FilesManager, FilesManagerEvents } from "../types.js";

const log = logger.scope("local-files-manager");

const IGNORE_PATTERNS = ["**/node_modules/**", "**/.git/**", "**/.jj/**"];
const DEBOUNCE_MS = 500;
const BULK_THRESHOLD = 100;

interface PendingChanges {
  dirs: Set<string>;
  files: Set<string>;
  deletes: Set<string>;
  timer: ReturnType<typeof setTimeout> | null;
}

interface RepoWatcher {
  files: watcher.AsyncSubscription;
  git: watcher.AsyncSubscription | null;
  pending: PendingChanges;
}

export class LocalFilesManager
  extends TypedEventEmitter<FilesManagerEvents>
  implements FilesManager
{
  private watchers = new Map<string, RepoWatcher>();

  constructor(private fsService: FsService) {
    super();
  }

  async list(dirPath: string): Promise<DirectoryEntry[]> {
    try {
      const entries = await fs.readdir(dirPath, { withFileTypes: true });
      return entries
        .filter((e) => !e.name.startsWith("."))
        .map((e) => ({
          name: e.name,
          path: path.join(dirPath, e.name),
          type: e.isDirectory() ? ("directory" as const) : ("file" as const),
        }))
        .sort((a, b) =>
          a.type !== b.type
            ? a.type === "directory"
              ? -1
              : 1
            : a.name.localeCompare(b.name),
        );
    } catch (error) {
      log.error("Failed to list directory:", error);
      return [];
    }
  }

  async listRepoFiles(
    repoPath: string,
    query?: string,
    limit?: number,
  ): Promise<FileEntry[]> {
    const files = await this.fsService.listRepoFiles(repoPath, query, limit);
    return files.map((f) => ({
      path: f.path,
      name: f.name,
      changed: f.changed ?? false,
    }));
  }

  read(repoPath: string, filePath: string): Promise<string | null> {
    return this.fsService.readRepoFile(repoPath, filePath);
  }

  write(repoPath: string, filePath: string, content: string): Promise<void> {
    return this.fsService.writeRepoFile(repoPath, filePath, content);
  }

  async startWatching(repoPath: string): Promise<void> {
    if (this.watchers.has(repoPath)) return;

    await fs.mkdir(this.snapshotsDir, { recursive: true });
    await this.emitChangesSinceSnapshot(repoPath);

    const pending: PendingChanges = {
      dirs: new Set(),
      files: new Set(),
      deletes: new Set(),
      timer: null,
    };

    this.watchers.set(repoPath, {
      files: await this.watchFiles(repoPath, pending),
      git: await this.watchGit(repoPath),
      pending,
    });
  }

  async stopWatching(repoPath: string): Promise<void> {
    const w = this.watchers.get(repoPath);
    if (!w) return;

    if (w.pending.timer) clearTimeout(w.pending.timer);
    await this.saveSnapshot(repoPath);
    await w.files.unsubscribe();
    await w.git?.unsubscribe();
    this.watchers.delete(repoPath);
  }

  async shutdown(): Promise<void> {
    log.info("Shutting down local files manager", {
      watcherCount: this.watchers.size,
    });
    const repoPaths = Array.from(this.watchers.keys());
    await Promise.all(repoPaths.map((repoPath) => this.stopWatching(repoPath)));
  }

  private get snapshotsDir(): string {
    return path.join(app.getPath("userData"), "snapshots");
  }

  private snapshotPath(repoPath: string): string {
    return path.join(
      this.snapshotsDir,
      `${Buffer.from(repoPath).toString("base64url")}.snapshot`,
    );
  }

  private async saveSnapshot(repoPath: string): Promise<void> {
    try {
      await watcher.writeSnapshot(repoPath, this.snapshotPath(repoPath), {
        ignore: IGNORE_PATTERNS,
      });
    } catch (error) {
      log.error("Failed to write snapshot:", error);
    }
  }

  private async emitChangesSinceSnapshot(repoPath: string): Promise<void> {
    const snapshotPath = this.snapshotPath(repoPath);
    try {
      await fs.access(snapshotPath);
    } catch {
      return;
    }

    const events = await watcher.getEventsSince(repoPath, snapshotPath, {
      ignore: IGNORE_PATTERNS,
    });

    const affectedDirs = new Set(events.map((e) => path.dirname(e.path)));
    for (const dirPath of affectedDirs) {
      this.emit("directoryChanged", { repoPath, dirPath });
    }
  }

  private async watchFiles(
    repoPath: string,
    pending: PendingChanges,
  ): Promise<watcher.AsyncSubscription> {
    return watcher.subscribe(
      repoPath,
      (err, events) => {
        if (err) {
          this.handleWatcherError(err, repoPath);
          return;
        }
        this.queueEvents(repoPath, pending, events);
      },
      { ignore: IGNORE_PATTERNS },
    );
  }

  private handleWatcherError(err: Error, repoPath: string): void {
    if (!existsSync(repoPath)) {
      log.info(`Directory deleted, stopping watcher: ${repoPath}`);
      this.stopWatching(repoPath).catch((e) =>
        log.warn(`Failed to stop watcher: ${e}`),
      );
    } else {
      log.error("Watcher error:", err);
    }
  }

  private queueEvents(
    repoPath: string,
    pending: PendingChanges,
    events: watcher.Event[],
  ): void {
    for (const event of events) {
      pending.dirs.add(path.dirname(event.path));
      if (event.type === "delete") {
        pending.deletes.add(event.path);
      } else {
        pending.files.add(event.path);
      }
    }

    if (pending.timer) clearTimeout(pending.timer);
    pending.timer = setTimeout(
      () => this.flushPending(repoPath, pending),
      DEBOUNCE_MS,
    );
  }

  private flushPending(repoPath: string, pending: PendingChanges): void {
    const totalChanges = pending.files.size + pending.deletes.size;

    if (totalChanges > BULK_THRESHOLD) {
      this.emit("gitStateChanged", { repoPath });
      pending.dirs.clear();
      pending.files.clear();
      pending.deletes.clear();
      pending.timer = null;
      return;
    }

    for (const dirPath of pending.dirs) {
      this.emit("directoryChanged", { repoPath, dirPath });
    }
    for (const filePath of pending.files) {
      this.emit("fileChanged", { repoPath, filePath });
    }
    for (const filePath of pending.deletes) {
      this.emit("fileDeleted", { repoPath, filePath });
    }

    pending.dirs.clear();
    pending.files.clear();
    pending.deletes.clear();
    pending.timer = null;
  }

  private async watchGit(
    repoPath: string,
  ): Promise<watcher.AsyncSubscription | null> {
    try {
      const gitDir = await this.resolveGitDir(repoPath);
      return watcher.subscribe(gitDir, (err, events) => {
        if (err) {
          log.error("Git watcher error:", err);
          return;
        }
        const isRelevant = events.some(
          (e) =>
            e.path.endsWith("/HEAD") ||
            e.path.endsWith("/index") ||
            e.path.includes("/refs/heads/"),
        );
        if (isRelevant) {
          this.emit("gitStateChanged", { repoPath });
        }
      });
    } catch (error) {
      log.warn("Failed to set up git watcher:", error);
      return null;
    }
  }

  private async resolveGitDir(repoPath: string): Promise<string> {
    const gitPath = path.join(repoPath, ".git");
    const stat = await fs.stat(gitPath);

    if (stat.isDirectory()) return gitPath;

    const content = await fs.readFile(gitPath, "utf-8");
    const match = content.match(/gitdir:\s*(.+)/);
    if (!match) throw new Error("Invalid .git file format");
    return match[1].trim();
  }
}

export class CloudFilesManager implements FilesManager {
  async list(_dirPath: string): Promise<DirectoryEntry[]> {
    log.info("CloudFilesManager.list called (no-op)");
    return [];
  }

  async listRepoFiles(
    _repoPath: string,
    _query?: string,
    _limit?: number,
  ): Promise<FileEntry[]> {
    log.info("CloudFilesManager.listRepoFiles called (no-op)");
    return [];
  }

  async read(_repoPath: string, _filePath: string): Promise<string | null> {
    log.info("CloudFilesManager.read called (no-op)");
    return null;
  }

  async write(
    _repoPath: string,
    _filePath: string,
    _content: string,
  ): Promise<void> {
    log.info("CloudFilesManager.write called (no-op)");
  }

  async startWatching(_repoPath: string): Promise<void> {
    log.info("CloudFilesManager.startWatching called (no-op)");
  }

  async stopWatching(_repoPath: string): Promise<void> {
    log.info("CloudFilesManager.stopWatching called (no-op)");
  }

  on<K extends keyof FilesManagerEvents>(
    _event: K,
    _listener: (payload: FilesManagerEvents[K]) => void,
  ): void {
    // No-op for cloud
  }

  off<K extends keyof FilesManagerEvents>(
    _event: K,
    _listener: (payload: FilesManagerEvents[K]) => void,
  ): void {
    // No-op for cloud
  }
}
