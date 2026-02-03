import { logger } from "../../../lib/logger.js";
import type { DirectoryEntry } from "../../file-watcher/schemas.js";
import { FileWatcherEvent } from "../../file-watcher/schemas.js";
import type { FileWatcherService } from "../../file-watcher/service.js";
import type { FsService } from "../../fs/service.js";
import type { FileEntry, FilesManager, FilesManagerEvents } from "../types.js";

const log = logger.scope("local-files-manager");

export class LocalFilesManager implements FilesManager {
  constructor(
    private fileWatcherService: FileWatcherService,
    private fsService: FsService,
  ) {}

  list(dirPath: string): Promise<DirectoryEntry[]> {
    return this.fileWatcherService.listDirectory(dirPath);
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

  startWatching(repoPath: string): Promise<void> {
    return this.fileWatcherService.startWatching(repoPath);
  }

  stopWatching(repoPath: string): Promise<void> {
    return this.fileWatcherService.stopWatching(repoPath);
  }

  on<K extends keyof FilesManagerEvents>(
    event: K,
    listener: (payload: FilesManagerEvents[K]) => void,
  ): void {
    const fwEvent = this.mapEventName(event);
    if (fwEvent) {
      this.fileWatcherService.on(fwEvent, listener as never);
    }
  }

  off<K extends keyof FilesManagerEvents>(
    event: K,
    listener: (payload: FilesManagerEvents[K]) => void,
  ): void {
    const fwEvent = this.mapEventName(event);
    if (fwEvent) {
      this.fileWatcherService.off(fwEvent, listener as never);
    }
  }

  private mapEventName(
    event: keyof FilesManagerEvents,
  ): (typeof FileWatcherEvent)[keyof typeof FileWatcherEvent] | null {
    switch (event) {
      case "fileChanged":
        return FileWatcherEvent.FileChanged;
      case "fileDeleted":
        return FileWatcherEvent.FileDeleted;
      case "directoryChanged":
        return FileWatcherEvent.DirectoryChanged;
      case "gitStateChanged":
        return FileWatcherEvent.GitStateChanged;
      default:
        return null;
    }
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
