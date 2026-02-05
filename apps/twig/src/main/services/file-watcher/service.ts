import { inject, injectable, preDestroy } from "inversify";
import { MAIN_TOKENS } from "../../di/tokens.js";
import { logger } from "../../lib/logger.js";
import { TypedEventEmitter } from "../../lib/typed-event-emitter.js";
import type { EnvironmentService } from "../environment/service.js";
import {
  type DirectoryEntry,
  FileWatcherEvent,
  type FileWatcherEvents,
} from "./schemas.js";

const log = logger.scope("file-watcher");

@injectable()
export class FileWatcherService extends TypedEventEmitter<FileWatcherEvents> {
  private eventForwardingSetup = false;

  constructor(
    @inject(MAIN_TOKENS.EnvironmentService)
    private environmentService: EnvironmentService,
  ) {
    super();
  }

  private get filesManager() {
    return this.environmentService.getLocalEnvironment().files;
  }

  private setupEventForwarding(): void {
    if (this.eventForwardingSetup) return;
    this.eventForwardingSetup = true;

    this.filesManager.on("fileChanged", (payload) => {
      this.emit(FileWatcherEvent.FileChanged, payload);
    });
    this.filesManager.on("fileDeleted", (payload) => {
      this.emit(FileWatcherEvent.FileDeleted, payload);
    });
    this.filesManager.on("directoryChanged", (payload) => {
      this.emit(FileWatcherEvent.DirectoryChanged, payload);
    });
    this.filesManager.on("gitStateChanged", (payload) => {
      this.emit(FileWatcherEvent.GitStateChanged, payload);
    });
  }

  async listDirectory(dirPath: string): Promise<DirectoryEntry[]> {
    return this.filesManager.list(dirPath);
  }

  async startWatching(repoPath: string): Promise<void> {
    this.setupEventForwarding();
    return this.filesManager.startWatching(repoPath);
  }

  async stopWatching(repoPath: string): Promise<void> {
    return this.filesManager.stopWatching(repoPath);
  }

  @preDestroy()
  async shutdown(): Promise<void> {
    log.info("FileWatcherService: shutting down via manager");
    return this.filesManager.shutdown();
  }
}
