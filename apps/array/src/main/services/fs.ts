import { exec } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import { type IpcMainInvokeEvent, ipcMain } from "electron";
import { logger } from "../lib/logger";
import { getChangedFilesForRepo } from "./git";

const log = logger.scope("fs");

const execAsync = promisify(exec);
const fsPromises = fs.promises;

interface FileEntry {
  path: string;
  name: string;
  changed?: boolean;
}

// Cache for repository files to avoid rescanning
const repoFileCache = new Map<
  string,
  { files: FileEntry[]; timestamp: number }
>();
const CACHE_TTL = 30000; // 30 seconds

/**
 * List files using git ls-files - fast and works for any git repository.
 * This is much faster than recursive fs.readdir for large codebases.
 */
async function listFilesWithGit(
  repoPath: string,
  changedFiles: Set<string>,
): Promise<FileEntry[]> {
  try {
    const { stdout: trackedStdout } = await execAsync("git ls-files", {
      cwd: repoPath,
      maxBuffer: 50 * 1024 * 1024,
    });

    const { stdout: untrackedStdout } = await execAsync(
      "git ls-files --others --exclude-standard",
      { cwd: repoPath, maxBuffer: 50 * 1024 * 1024 },
    );

    const allFiles = [
      ...trackedStdout.split("\n").filter(Boolean),
      ...untrackedStdout.split("\n").filter(Boolean),
    ];

    return allFiles.map((relativePath) => ({
      path: relativePath,
      name: path.basename(relativePath),
      changed: changedFiles.has(relativePath),
    }));
  } catch (error) {
    log.error("Error listing files with git:", error);
    return [];
  }
}

/**
 * List files with early termination using grep and head.
 * Returns limited results directly from git without loading all files into memory.
 */
async function listFilesWithQuery(
  repoPath: string,
  query: string,
  limit: number,
  changedFiles: Set<string>,
): Promise<FileEntry[]> {
  try {
    // escape special regex characters in the query for grep
    const escapedQuery = query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

    // grep -i for case-insensitive matching, head for early termination
    const grepCmd = `grep -i "${escapedQuery}" | head -n ${limit}`;

    // the || true prevents error when grep finds no matches
    const [trackedResult, untrackedResult] = await Promise.all([
      execAsync(`git ls-files | ${grepCmd} || true`, {
        cwd: repoPath,
        maxBuffer: 1024 * 1024,
      }),
      execAsync(
        `git ls-files --others --exclude-standard | ${grepCmd} || true`,
        {
          cwd: repoPath,
          maxBuffer: 1024 * 1024,
        },
      ),
    ]);

    const trackedFiles = trackedResult.stdout.split("\n").filter(Boolean);
    const untrackedFiles = untrackedResult.stdout.split("\n").filter(Boolean);

    // combine and limit to requested amount (in case both sources have results)
    const allFiles = [...trackedFiles, ...untrackedFiles].slice(0, limit);

    return allFiles.map((relativePath) => ({
      path: relativePath,
      name: path.basename(relativePath),
      changed: changedFiles.has(relativePath),
    }));
  } catch (error) {
    log.error("Error listing files with query:", error);
    return [];
  }
}

export function registerFsIpc(): void {
  ipcMain.handle(
    "list-repo-files",
    async (
      _event: IpcMainInvokeEvent,
      repoPath: string,
      query?: string,
      limit?: number,
    ): Promise<FileEntry[]> => {
      if (!repoPath) return [];

      const resultLimit = limit ?? 50;

      try {
        const changedFiles = await getChangedFilesForRepo(repoPath);

        // when there is a query, use early termination with grep + head
        // this avoids loading all files into memory for filtered searches
        if (query?.trim()) {
          return await listFilesWithQuery(
            repoPath,
            query.trim(),
            resultLimit,
            changedFiles,
          );
        }

        const cached = repoFileCache.get(repoPath);
        const now = Date.now();

        let allFiles: FileEntry[];

        if (cached && now - cached.timestamp < CACHE_TTL) {
          allFiles = cached.files;
        } else {
          allFiles = await listFilesWithGit(repoPath, changedFiles);

          repoFileCache.set(repoPath, {
            files: allFiles,
            timestamp: now,
          });
        }

        return allFiles.slice(0, resultLimit);
      } catch (error) {
        log.error("Error listing repo files:", error);
        return [];
      }
    },
  );

  ipcMain.handle(
    "read-repo-file",
    async (
      _event: IpcMainInvokeEvent,
      repoPath: string,
      filePath: string,
    ): Promise<string | null> => {
      try {
        const fullPath = path.join(repoPath, filePath);
        const resolvedPath = path.resolve(fullPath);
        const resolvedRepo = path.resolve(repoPath);
        if (!resolvedPath.startsWith(resolvedRepo)) {
          throw new Error("Access denied: path outside repository");
        }

        const content = await fsPromises.readFile(fullPath, "utf-8");
        return content;
      } catch (error) {
        log.error(`Failed to read file ${filePath} from ${repoPath}:`, error);
        return null;
      }
    },
  );

  ipcMain.handle(
    "write-repo-file",
    async (
      _event: IpcMainInvokeEvent,
      repoPath: string,
      filePath: string,
      content: string,
    ): Promise<void> => {
      try {
        const fullPath = path.join(repoPath, filePath);
        const resolvedPath = path.resolve(fullPath);
        const resolvedRepo = path.resolve(repoPath);
        if (!resolvedPath.startsWith(resolvedRepo)) {
          throw new Error("Access denied: path outside repository");
        }

        await fsPromises.writeFile(fullPath, content, "utf-8");
        log.debug(`Wrote file ${filePath} to ${repoPath}`);

        repoFileCache.delete(repoPath);
      } catch (error) {
        log.error(`Failed to write file ${filePath} to ${repoPath}:`, error);
        throw error;
      }
    },
  );
}
