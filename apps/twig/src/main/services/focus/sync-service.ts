import fs from "node:fs/promises";
import path from "node:path";
import * as watcher from "@parcel/watcher";
import ignore, { type Ignore } from "ignore";
import { injectable } from "inversify";
import { logger } from "../../lib/logger.js";
import { git } from "./service.js";

const log = logger.scope("focus-sync");

const DEBOUNCE_MS = 250;
const ALWAYS_IGNORE = [".git", ".jj", "node_modules"];

interface PendingSync {
  /** Files changed in main, need to sync to worktree */
  mainToWorktree: Map<string, "copy" | "delete">;
  /** Files changed in worktree, need to sync to main */
  worktreeToMain: Map<string, "copy" | "delete">;
  timer: ReturnType<typeof setTimeout> | null;
}

/** How long to ignore events for a file after we write it */
const WRITE_COOLDOWN_MS = 1000;

@injectable()
export class FocusSyncService {
  private mainRepoPath: string | null = null;
  private worktreePath: string | null = null;
  private mainSubscription: watcher.AsyncSubscription | null = null;
  private worktreeSubscription: watcher.AsyncSubscription | null = null;
  private gitignore!: Ignore;
  private pending: PendingSync = {
    mainToWorktree: new Map(),
    worktreeToMain: new Map(),
    timer: null,
  };
  private syncing = false;
  private currentSyncPromise: Promise<void> | null = null;

  /** Files we recently wrote - map of absolute path to write timestamp */
  private recentWrites: Map<string, number> = new Map();

  async startSync(mainRepoPath: string, worktreePath: string): Promise<void> {
    if (this.mainSubscription || this.worktreeSubscription) {
      await this.stopSync();
    }

    this.mainRepoPath = mainRepoPath;
    this.worktreePath = worktreePath;

    // Load .gitignore patterns
    await this.loadGitignore(mainRepoPath);

    log.info(
      `Starting bidirectional sync: ${mainRepoPath} <-> ${worktreePath}`,
    );

    // Initial sync: copy all uncommitted files from worktree to main
    await this.copyUncommittedFiles(worktreePath, mainRepoPath);

    // Start watching both directories
    const watcherIgnore = ALWAYS_IGNORE.map((p) => `**/${p}/**`);

    this.mainSubscription = await watcher.subscribe(
      mainRepoPath,
      (err, events) => {
        if (err) {
          log.error("Main repo watcher error:", err);
          return;
        }
        this.handleEvents("main", events);
      },
      { ignore: watcherIgnore },
    );

    this.worktreeSubscription = await watcher.subscribe(
      worktreePath,
      (err, events) => {
        if (err) {
          log.error("Worktree watcher error:", err);
          return;
        }
        this.handleEvents("worktree", events);
      },
      { ignore: watcherIgnore },
    );
  }

  async stopSync(): Promise<void> {
    log.info("Stopping bidirectional sync");

    if (this.pending.timer) {
      clearTimeout(this.pending.timer);
      this.pending.timer = null;
    }

    // Wait for any in-flight sync to complete
    if (this.currentSyncPromise) {
      log.debug("Waiting for in-flight sync to complete");
      await this.currentSyncPromise;
    }

    // Flush any remaining pending changes (without rescheduling)
    if (
      this.pending.mainToWorktree.size > 0 ||
      this.pending.worktreeToMain.size > 0
    ) {
      await this.doFlush();
    }

    if (this.mainSubscription) {
      await this.mainSubscription.unsubscribe();
      this.mainSubscription = null;
    }

    if (this.worktreeSubscription) {
      await this.worktreeSubscription.unsubscribe();
      this.worktreeSubscription = null;
    }

    this.mainRepoPath = null;
    this.worktreePath = null;
    this.pending.mainToWorktree.clear();
    this.pending.worktreeToMain.clear();
    this.recentWrites.clear();
  }

  /**
   * Copy all uncommitted files from source to destination.
   * Used for initial sync when focusing, and for local worktree transfers.
   */
  async copyUncommittedFiles(srcPath: string, dstPath: string): Promise<void> {
    const stdout = await git(srcPath, "status", "--porcelain").catch(() => "");

    if (!stdout) {
      log.info("No uncommitted files to copy");
      return;
    }

    // Load gitignore from source
    const ig = ignore().add(ALWAYS_IGNORE);
    try {
      const content = await fs.readFile(
        path.join(srcPath, ".gitignore"),
        "utf-8",
      );
      ig.add(content);
    } catch {
      // No gitignore, that's fine
    }

    const files: string[] = [];
    for (const line of stdout.split("\n")) {
      if (!line.trim()) continue;

      const status = line.slice(0, 2);
      let filename = line.slice(3);

      if (status.startsWith("R")) {
        const parts = filename.split(" -> ");
        filename = parts[parts.length - 1];
      }

      if (status[1] === "D") {
        continue;
      }

      files.push(filename);
    }

    log.info(
      `Copying ${files.length} uncommitted files from ${srcPath} to ${dstPath}`,
    );

    for (const file of files) {
      if (ig.ignores(file)) {
        continue;
      }

      const src = path.join(srcPath, file);
      const dst = path.join(dstPath, file);
      await this.copyFileDirect(src, dst);
    }
  }

  private async copyFileDirect(
    srcPath: string,
    dstPath: string,
  ): Promise<void> {
    try {
      const srcStat = await fs.stat(srcPath);
      if (!srcStat.isFile()) return;

      await fs.mkdir(path.dirname(dstPath), { recursive: true });
      await fs.copyFile(srcPath, dstPath);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        log.warn(`Failed to copy file: ${srcPath}`, error);
      }
    }
  }

  private async loadGitignore(repoPath: string): Promise<void> {
    this.gitignore = ignore().add(ALWAYS_IGNORE);

    try {
      const content = await fs.readFile(
        path.join(repoPath, ".gitignore"),
        "utf-8",
      );
      this.gitignore.add(content);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        throw error;
      }
    }
  }

  private handleEvents(
    source: "main" | "worktree",
    events: watcher.Event[],
  ): void {
    const basePath = source === "main" ? this.mainRepoPath : this.worktreePath;
    if (!basePath) return;

    const pendingMap =
      source === "main"
        ? this.pending.mainToWorktree
        : this.pending.worktreeToMain;

    const now = Date.now();

    for (const event of events) {
      const relativePath = path.relative(basePath, event.path);

      // Skip ignored files
      if (this.gitignore.ignores(relativePath)) {
        continue;
      }

      // Skip files we recently wrote (prevents sync loops)
      const lastWrite = this.recentWrites.get(event.path);
      if (lastWrite && now - lastWrite < WRITE_COOLDOWN_MS) {
        continue;
      }

      if (event.type === "delete") {
        pendingMap.set(relativePath, "delete");
      } else {
        // create or update
        pendingMap.set(relativePath, "copy");
      }
    }

    // Schedule flush
    if (this.pending.timer) {
      clearTimeout(this.pending.timer);
    }
    this.pending.timer = setTimeout(() => this.flushPending(), DEBOUNCE_MS);
  }

  private async flushPending(): Promise<void> {
    if (this.syncing) {
      // Already syncing, reschedule
      this.pending.timer = setTimeout(() => this.flushPending(), DEBOUNCE_MS);
      return;
    }

    this.currentSyncPromise = this.doFlush();
    await this.currentSyncPromise;
    this.currentSyncPromise = null;
  }

  private async doFlush(): Promise<void> {
    this.syncing = true;
    this.pending.timer = null;

    try {
      // Process main -> worktree
      if (this.pending.mainToWorktree.size > 0) {
        const ops = new Map(this.pending.mainToWorktree);
        this.pending.mainToWorktree.clear();
        await this.syncFiles("main", ops);
      }

      // Process worktree -> main
      if (this.pending.worktreeToMain.size > 0) {
        const ops = new Map(this.pending.worktreeToMain);
        this.pending.worktreeToMain.clear();
        await this.syncFiles("worktree", ops);
      }
    } finally {
      this.syncing = false;
    }
  }

  private async syncFiles(
    source: "main" | "worktree",
    operations: Map<string, "copy" | "delete">,
  ): Promise<void> {
    const srcBase = source === "main" ? this.mainRepoPath : this.worktreePath;
    const dstBase = source === "main" ? this.worktreePath : this.mainRepoPath;

    if (!srcBase || !dstBase) return;

    for (const [relativePath, op] of operations) {
      const srcPath = path.join(srcBase, relativePath);
      const dstPath = path.join(dstBase, relativePath);

      if (op === "delete") {
        await this.deleteFile(dstPath);
      } else {
        await this.copyFile(srcPath, dstPath);
      }
    }
  }

  private async copyFile(srcPath: string, dstPath: string): Promise<void> {
    let srcStat: Awaited<ReturnType<typeof fs.stat>>;
    try {
      srcStat = await fs.stat(srcPath);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        log.debug(`Source file no longer exists, skipping: ${srcPath}`);
        return;
      }
      throw error;
    }

    if (!srcStat.isFile()) {
      return;
    }

    try {
      const [srcContent, dstContent] = await Promise.all([
        fs.readFile(srcPath),
        fs.readFile(dstPath),
      ]);

      if (srcContent.equals(dstContent)) {
        return;
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        throw error;
      }
    }

    await fs.mkdir(path.dirname(dstPath), { recursive: true });
    this.recentWrites.set(dstPath, Date.now());
    await fs.copyFile(srcPath, dstPath);
  }

  private async deleteFile(filePath: string): Promise<void> {
    this.recentWrites.set(filePath, Date.now());

    try {
      await fs.rm(filePath);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        log.debug(`File already deleted: ${filePath}`);
        return;
      }
      throw error;
    }
  }
}
