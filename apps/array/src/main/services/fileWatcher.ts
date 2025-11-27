import fs from "node:fs/promises";
import path from "node:path";
import * as watcher from "@parcel/watcher";
import {
  app,
  type BrowserWindow,
  type IpcMainInvokeEvent,
  ipcMain,
} from "electron";
import { logger } from "../lib/logger";

const log = logger.scope("file-watcher");

const WATCHER_IGNORE_PATTERNS = ["**/node_modules/**", "**/.git/**"];
const DEBOUNCE_MS = 100;

interface DirectoryEntry {
  name: string;
  path: string;
  type: "file" | "directory";
}

interface RepoState {
  subscription: watcher.AsyncSubscription | null;
  gitSubscription: watcher.AsyncSubscription | null;
  pendingDirs: Set<string>;
  pendingFiles: Set<string>;
  pendingDeletes: Set<string>;
  debounceTimer: ReturnType<typeof setTimeout> | null;
}

class FileService {
  private repos = new Map<string, RepoState>();
  private mainWindow: BrowserWindow | null = null;

  setMainWindow(win: BrowserWindow | null): void {
    this.mainWindow = win;
  }

  private getSnapshotPath(repoPath: string): string {
    const hash = Buffer.from(repoPath).toString("base64url");
    return path.join(app.getPath("userData"), "snapshots", `${hash}.snapshot`);
  }

  private flushPendingChanges(repoPath: string, state: RepoState): void {
    for (const dir of state.pendingDirs) {
      this.emit("fs:directory-changed", { repoPath, dirPath: dir });
    }
    for (const filePath of state.pendingFiles) {
      this.emit("fs:file-changed", { repoPath, filePath });
    }
    for (const filePath of state.pendingDeletes) {
      this.emit("fs:file-deleted", { repoPath, filePath });
    }
    state.pendingDirs.clear();
    state.pendingFiles.clear();
    state.pendingDeletes.clear();
    state.debounceTimer = null;
  }

  async listDirectory(dirPath: string): Promise<DirectoryEntry[]> {
    try {
      const entries = await fs.readdir(dirPath, { withFileTypes: true });
      return entries
        .filter((entry) => !entry.name.startsWith(".") || entry.name === ".git")
        .map((entry) => ({
          name: entry.name,
          path: path.join(dirPath, entry.name),
          type: entry.isDirectory()
            ? ("directory" as const)
            : ("file" as const),
        }))
        .sort((a, b) => {
          if (a.type !== b.type) return a.type === "directory" ? -1 : 1;
          return a.name.localeCompare(b.name);
        });
    } catch (error) {
      log.error("Failed to list directory:", error);
      return [];
    }
  }

  async startWatching(repoPath: string): Promise<void> {
    if (this.repos.has(repoPath)) return;

    const snapshotsDir = path.join(app.getPath("userData"), "snapshots");
    await fs.mkdir(snapshotsDir, { recursive: true });

    const snapshotPath = this.getSnapshotPath(repoPath);
    try {
      await fs.access(snapshotPath);
      const events = await watcher.getEventsSince(repoPath, snapshotPath, {
        ignore: WATCHER_IGNORE_PATTERNS,
      });
      if (events.length > 0) {
        const affectedDirs = new Set<string>();
        for (const event of events) {
          affectedDirs.add(path.dirname(event.path));
        }
        for (const dir of affectedDirs) {
          this.emit("fs:directory-changed", { repoPath, dirPath: dir });
        }
      }
    } catch {
      // No snapshot exists yet
    }

    const state: RepoState = {
      subscription: null,
      gitSubscription: null,
      pendingDirs: new Set(),
      pendingFiles: new Set(),
      pendingDeletes: new Set(),
      debounceTimer: null,
    };

    const subscription = await watcher.subscribe(
      repoPath,
      (err, events) => {
        if (err) {
          log.error("Watcher error:", err);
          return;
        }

        for (const event of events) {
          state.pendingDirs.add(path.dirname(event.path));
          if (event.type === "update") {
            state.pendingFiles.add(event.path);
          } else if (event.type === "delete") {
            state.pendingDeletes.add(event.path);
          }
        }

        if (state.debounceTimer) clearTimeout(state.debounceTimer);
        state.debounceTimer = setTimeout(
          () => this.flushPendingChanges(repoPath, state),
          DEBOUNCE_MS,
        );
      },
      { ignore: WATCHER_IGNORE_PATTERNS },
    );

    const gitPath = path.join(repoPath, ".git");
    let gitSubscription: watcher.AsyncSubscription | null = null;
    try {
      const gitStat = await fs.stat(gitPath);
      let gitDirToWatch: string;

      if (gitStat.isDirectory()) {
        // Regular repo: .git is a directory
        gitDirToWatch = gitPath;
      } else if (gitStat.isFile()) {
        // Worktree: .git is a file containing "gitdir: /path/to/main/.git/worktrees/name"
        const gitFileContent = await fs.readFile(gitPath, "utf-8");
        const match = gitFileContent.match(/gitdir:\s*(.+)/);
        if (!match) {
          throw new Error("Invalid .git file format");
        }
        gitDirToWatch = match[1].trim();
      } else {
        throw new Error(".git is neither file nor directory");
      }

      gitSubscription = await watcher.subscribe(
        gitDirToWatch,
        (err, events) => {
          if (err) {
            log.error("Git watcher error:", err);
            return;
          }
          if (
            events.some(
              (e) => e.path.endsWith("/HEAD") || e.path.endsWith("/index"),
            )
          ) {
            this.emit("git:state-changed", { repoPath });
          }
        },
      );
    } catch (error) {
      log.warn("Failed to set up git watcher:", error);
    }

    state.subscription = subscription;
    state.gitSubscription = gitSubscription;
    this.repos.set(repoPath, state);
  }

  async stopWatching(repoPath: string): Promise<void> {
    const state = this.repos.get(repoPath);
    if (state) {
      if (state.debounceTimer) {
        clearTimeout(state.debounceTimer);
      }

      try {
        const snapshotPath = this.getSnapshotPath(repoPath);
        await watcher.writeSnapshot(repoPath, snapshotPath, {
          ignore: WATCHER_IGNORE_PATTERNS,
        });
      } catch (error) {
        log.error("Failed to write snapshot:", error);
      }

      await state.subscription?.unsubscribe();
      await state.gitSubscription?.unsubscribe();
      this.repos.delete(repoPath);
    }
  }

  private emit(channel: string, data: unknown): void {
    this.mainWindow?.webContents.send(channel, data);
  }
}

export const fileService = new FileService();

export function registerFileWatcherIpc(
  getMainWindow: () => BrowserWindow | null,
): void {
  ipcMain.handle(
    "fs:list-directory",
    async (_event: IpcMainInvokeEvent, dirPath: string) => {
      return fileService.listDirectory(dirPath);
    },
  );

  ipcMain.handle(
    "watcher:start",
    async (_event: IpcMainInvokeEvent, repoPath: string) => {
      fileService.setMainWindow(getMainWindow());
      return fileService.startWatching(repoPath);
    },
  );

  ipcMain.handle(
    "watcher:stop",
    async (_event: IpcMainInvokeEvent, repoPath: string) => {
      return fileService.stopWatching(repoPath);
    },
  );
}
