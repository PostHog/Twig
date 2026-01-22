import { exec } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import { inject, injectable } from "inversify";
import { MAIN_TOKENS } from "../../di/tokens.js";
import { logger } from "../../lib/logger.js";
import { FileWatcherEvent } from "../file-watcher/schemas.js";
import type { FileWatcherService } from "../file-watcher/service.js";
import { getChangedFilesForRepo } from "../git.js";
import type { FileEntry } from "./schemas.js";

const log = logger.scope("fs");
const execAsync = promisify(exec);

@injectable()
export class FsService {
  private static readonly CACHE_TTL = 30000;
  private cache = new Map<string, { files: FileEntry[]; timestamp: number }>();

  constructor(
    @inject(MAIN_TOKENS.FileWatcherService)
    private fileWatcher: FileWatcherService,
  ) {
    this.fileWatcher.on(FileWatcherEvent.FileChanged, ({ repoPath }) => {
      this.invalidateCache(repoPath);
    });

    this.fileWatcher.on(FileWatcherEvent.FileDeleted, ({ repoPath }) => {
      this.invalidateCache(repoPath);
    });

    this.fileWatcher.on(FileWatcherEvent.DirectoryChanged, ({ repoPath }) => {
      this.invalidateCache(repoPath);
    });

    this.fileWatcher.on(FileWatcherEvent.GitStateChanged, ({ repoPath }) => {
      this.invalidateCache(repoPath);
    });
  }

  async listRepoFiles(
    repoPath: string,
    query?: string,
    limit?: number,
  ): Promise<FileEntry[]> {
    if (!repoPath) return [];

    try {
      const changedFiles = await getChangedFilesForRepo(repoPath);

      if (query?.trim()) {
        const files = await this.gitLsFiles(repoPath, query.trim(), limit);
        return this.toFileEntries(files, changedFiles);
      }

      const cached = this.cache.get(repoPath);
      if (cached && Date.now() - cached.timestamp < FsService.CACHE_TTL) {
        return limit ? cached.files.slice(0, limit) : cached.files;
      }

      const files = await this.gitLsFiles(repoPath);
      const entries = this.toFileEntries(files, changedFiles);
      this.cache.set(repoPath, { files: entries, timestamp: Date.now() });

      return limit ? entries.slice(0, limit) : entries;
    } catch (error) {
      log.error("Error listing repo files:", error);
      return [];
    }
  }

  invalidateCache(repoPath?: string): void {
    if (repoPath) {
      this.cache.delete(repoPath);
    } else {
      this.cache.clear();
    }
  }

  async readRepoFile(
    repoPath: string,
    filePath: string,
  ): Promise<string | null> {
    try {
      return await fs.promises.readFile(
        this.resolvePath(repoPath, filePath),
        "utf-8",
      );
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        log.error(`Failed to read file ${filePath}:`, error);
      }
      return null;
    }
  }

  async writeRepoFile(
    repoPath: string,
    filePath: string,
    content: string,
  ): Promise<void> {
    await fs.promises.writeFile(
      this.resolvePath(repoPath, filePath),
      content,
      "utf-8",
    );
    this.invalidateCache(repoPath);
  }

  private resolvePath(repoPath: string, filePath: string): string {
    const fullPath = path.join(repoPath, filePath);
    const resolved = path.resolve(fullPath);
    if (!resolved.startsWith(path.resolve(repoPath))) {
      throw new Error("Access denied: path outside repository");
    }
    return fullPath;
  }

  private toFileEntries(
    files: string[],
    changedFiles: Set<string>,
  ): FileEntry[] {
    return files.map((p) => ({
      path: p,
      name: path.basename(p),
      changed: changedFiles.has(p),
    }));
  }

  private async gitLsFiles(
    repoPath: string,
    query?: string,
    limit?: number,
  ): Promise<string[]> {
    const filter = query
      ? ` | grep -i "${query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"${limit ? ` | head -n ${limit}` : ""}`
      : "";
    const suffix = query ? " || true" : "";
    const maxBuffer = query ? 1024 * 1024 : 50 * 1024 * 1024;

    const [tracked, untracked] = await Promise.all([
      execAsync(`git ls-files${filter}${suffix}`, { cwd: repoPath, maxBuffer }),
      execAsync(`git ls-files --others --exclude-standard${filter}${suffix}`, {
        cwd: repoPath,
        maxBuffer,
      }),
    ]);

    const files = [
      ...tracked.stdout.split("\n").filter(Boolean),
      ...untracked.stdout.split("\n").filter(Boolean),
    ];

    return limit ? files.slice(0, limit) : files;
  }
}
