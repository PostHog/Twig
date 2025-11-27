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

async function getGitIgnoredFiles(repoPath: string): Promise<Set<string>> {
  try {
    const { stdout } = await execAsync(
      "git ls-files --others --ignored --exclude-standard",
      { cwd: repoPath },
    );
    return new Set(
      stdout
        .split("\n")
        .filter(Boolean)
        .map((f) => path.join(repoPath, f)),
    );
  } catch {
    // If git command fails, return empty set
    return new Set();
  }
}

async function listFilesRecursive(
  dirPath: string,
  ignoredFiles: Set<string>,
  baseDir: string,
  changedFiles: Set<string>,
): Promise<FileEntry[]> {
  const files: FileEntry[] = [];

  try {
    const entries = await fsPromises.readdir(dirPath, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);
      const relativePath = path.relative(baseDir, fullPath);

      // Skip .git directory, node_modules, and common build dirs
      if (
        entry.name === ".git" ||
        entry.name === "node_modules" ||
        entry.name === "dist" ||
        entry.name === "build" ||
        entry.name === "__pycache__"
      ) {
        continue;
      }

      // Skip git-ignored files
      if (ignoredFiles.has(fullPath)) {
        continue;
      }

      if (entry.isDirectory()) {
        const subFiles = await listFilesRecursive(
          fullPath,
          ignoredFiles,
          baseDir,
          changedFiles,
        );
        files.push(...subFiles);
      } else if (entry.isFile()) {
        files.push({
          path: relativePath,
          name: entry.name,
          changed: changedFiles.has(relativePath),
        });
      }
    }
  } catch (error) {
    // Skip directories we can't read
    log.error(`Error reading directory ${dirPath}:`, error);
  }

  return files;
}

export function registerFsIpc(): void {
  ipcMain.handle(
    "list-repo-files",
    async (
      _event: IpcMainInvokeEvent,
      repoPath: string,
      query?: string,
    ): Promise<FileEntry[]> => {
      if (!repoPath) return [];

      try {
        // Check cache
        const cached = repoFileCache.get(repoPath);
        const now = Date.now();

        let allFiles: FileEntry[];

        if (cached && now - cached.timestamp < CACHE_TTL) {
          allFiles = cached.files;
        } else {
          // Get git-ignored files
          const ignoredFiles = await getGitIgnoredFiles(repoPath);

          // Get changed files from git
          const changedFiles = await getChangedFilesForRepo(repoPath);

          // List all files
          allFiles = await listFilesRecursive(
            repoPath,
            ignoredFiles,
            repoPath,
            changedFiles,
          );

          // Update cache
          repoFileCache.set(repoPath, {
            files: allFiles,
            timestamp: now,
          });
        }

        // Filter by query if provided
        if (query?.trim()) {
          const lowerQuery = query.toLowerCase();
          return allFiles
            .filter(
              (f) =>
                f.path.toLowerCase().includes(lowerQuery) ||
                f.name.toLowerCase().includes(lowerQuery),
            )
            .slice(0, 50); // Limit search results
        }

        return allFiles; // Return all files for full tree view
      } catch (error) {
        log.error("Error listing repo files:", error);
        return [];
      }
    },
  );

  ipcMain.handle(
    "clear-repo-file-cache",
    async (_event: IpcMainInvokeEvent, repoPath: string): Promise<void> => {
      if (repoPath) {
        repoFileCache.delete(repoPath);
      }
    },
  );

  // Plan file operations
  ipcMain.handle(
    "ensure-posthog-folder",
    async (
      _event: IpcMainInvokeEvent,
      repoPath: string,
      taskId: string,
    ): Promise<string> => {
      const posthogDir = path.join(repoPath, ".posthog", taskId);
      await fsPromises.mkdir(posthogDir, { recursive: true });
      return posthogDir;
    },
  );

  ipcMain.handle(
    "read-plan-file",
    async (
      _event: IpcMainInvokeEvent,
      repoPath: string,
      taskId: string,
    ): Promise<string | null> => {
      try {
        const planPath = path.join(repoPath, ".posthog", taskId, "plan.md");
        const content = await fsPromises.readFile(planPath, "utf-8");
        return content;
      } catch (error) {
        // File doesn't exist or can't be read
        log.debug(`Plan file not found for task ${taskId}:`, error);
        return null;
      }
    },
  );

  ipcMain.handle(
    "write-plan-file",
    async (
      _event: IpcMainInvokeEvent,
      repoPath: string,
      taskId: string,
      content: string,
    ): Promise<void> => {
      try {
        const posthogDir = path.join(repoPath, ".posthog", taskId);
        await fsPromises.mkdir(posthogDir, { recursive: true });
        const planPath = path.join(posthogDir, "plan.md");
        await fsPromises.writeFile(planPath, content, "utf-8");
        log.debug(`Plan file written for task ${taskId}`);
      } catch (error) {
        log.error(`Failed to write plan file for task ${taskId}:`, error);
        throw error;
      }
    },
  );

  ipcMain.handle(
    "list-task-artifacts",
    async (
      _event: IpcMainInvokeEvent,
      repoPath: string,
      taskId: string,
    ): Promise<
      Array<{ name: string; path: string; size: number; modifiedAt: string }>
    > => {
      try {
        const posthogDir = path.join(repoPath, ".posthog", taskId);

        // Check if directory exists
        try {
          await fsPromises.access(posthogDir);
        } catch {
          return []; // Directory doesn't exist yet
        }

        const entries = await fsPromises.readdir(posthogDir, {
          withFileTypes: true,
        });

        const artifacts = [];
        for (const entry of entries) {
          if (entry.isFile() && entry.name.endsWith(".md")) {
            const filePath = path.join(posthogDir, entry.name);
            const stats = await fsPromises.stat(filePath);
            artifacts.push({
              name: entry.name,
              path: filePath,
              size: stats.size,
              modifiedAt: stats.mtime.toISOString(),
            });
          }
        }

        return artifacts;
      } catch (error) {
        log.error(`Failed to list artifacts for task ${taskId}:`, error);
        return [];
      }
    },
  );

  ipcMain.handle(
    "read-task-artifact",
    async (
      _event: IpcMainInvokeEvent,
      repoPath: string,
      taskId: string,
      fileName: string,
    ): Promise<string | null> => {
      try {
        const filePath = path.join(repoPath, ".posthog", taskId, fileName);
        const content = await fsPromises.readFile(filePath, "utf-8");
        return content;
      } catch (error) {
        const nodeError = error as NodeJS.ErrnoException;
        if (nodeError.code === "ENOENT") {
          return null;
        }
        log.error(
          `Failed to read artifact ${fileName} for task ${taskId}:`,
          error,
        );
        return null;
      }
    },
  );

  ipcMain.handle(
    "append-to-artifact",
    async (
      _event: IpcMainInvokeEvent,
      repoPath: string,
      taskId: string,
      fileName: string,
      content: string,
    ): Promise<void> => {
      try {
        const filePath = path.join(repoPath, ".posthog", taskId, fileName);

        // Ensure the file exists before appending
        try {
          await fsPromises.access(filePath);
        } catch {
          throw new Error(`File ${fileName} does not exist for task ${taskId}`);
        }

        await fsPromises.appendFile(filePath, content, "utf-8");
        log.debug(`Appended content to ${fileName} for task ${taskId}`);
      } catch (error) {
        log.error(
          `Failed to append to artifact ${fileName} for task ${taskId}:`,
          error,
        );
        throw error;
      }
    },
  );

  ipcMain.handle(
    "save-question-answers",
    async (
      _event: IpcMainInvokeEvent,
      repoPath: string,
      taskId: string,
      answers: Array<{
        questionId: string;
        selectedOption: string;
        customInput?: string;
      }>,
    ): Promise<void> => {
      try {
        const posthogDir = path.join(repoPath, ".posthog", taskId);
        const researchPath = path.join(posthogDir, "research.json");

        // Ensure .posthog/taskId directory exists
        await fsPromises.mkdir(posthogDir, { recursive: true });

        // Read existing research.json or create minimal structure
        let researchData: {
          actionabilityScore: number;
          context: string;
          keyFiles: string[];
          blockers?: string[];
          questions?: Array<{
            id: string;
            question: string;
            options: string[];
          }>;
          answered?: boolean;
          answers?: Array<{
            questionId: string;
            selectedOption: string;
            customInput?: string;
          }>;
        };
        try {
          const content = await fsPromises.readFile(researchPath, "utf-8");
          researchData = JSON.parse(content);
        } catch {
          log.debug(
            `research.json not found for task ${taskId}, creating with answers only`,
          );
          researchData = {
            actionabilityScore: 0.5,
            context: "User provided answers to clarifying questions",
            keyFiles: [],
          };
        }

        // Update with answers
        researchData.answered = true;
        researchData.answers = answers;

        // Write back to file
        await fsPromises.writeFile(
          researchPath,
          JSON.stringify(researchData, null, 2),
          "utf-8",
        );

        log.debug(`Saved answers to research.json for task ${taskId}`);

        // Commit the answers (local mode - no push)
        try {
          await execAsync(`cd "${repoPath}" && git add .posthog/`, {
            cwd: repoPath,
          });
          await execAsync(
            `cd "${repoPath}" && git commit -m "Answer research questions for task ${taskId}"`,
            { cwd: repoPath },
          );
          log.debug(`Committed answers for task ${taskId}`);
        } catch (gitError) {
          log.warn(
            `Failed to commit answers (may not be a git repo or no changes):`,
            gitError,
          );
          // Don't throw - answers are still saved
        }
      } catch (error) {
        log.error(`Failed to save answers for task ${taskId}:`, error);
        throw error;
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
        log.error(
          `Failed to read file ${filePath} from ${repoPath}:`,
          error,
        );
        return null;
      }
    },
  );
}
