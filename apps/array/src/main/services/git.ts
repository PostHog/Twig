import { type ChildProcess, exec } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import type { ChangedFile, GitFileStatus } from "@shared/types";
import { type BrowserWindow, type IpcMainInvokeEvent, ipcMain } from "electron";
import { logger } from "../lib/logger";

const log = logger.scope("git");

const execAsync = promisify(exec);
const fsPromises = fs.promises;

const getAllFilesInDirectory = async (
  directoryPath: string,
  basePath: string,
): Promise<string[]> => {
  const files: string[] = [];
  const entries = await fsPromises.readdir(path.join(directoryPath, basePath), {
    withFileTypes: true,
  });

  for (const entry of entries) {
    const relativePath = path.join(basePath, entry.name);
    if (entry.isDirectory()) {
      const subFiles = await getAllFilesInDirectory(
        directoryPath,
        relativePath,
      );
      files.push(...subFiles);
    } else {
      files.push(relativePath);
    }
  }

  return files;
};

const CLONE_MAX_BUFFER = 10 * 1024 * 1024;

export interface GitHubRepo {
  organization: string;
  repository: string;
}

interface CloneProgress {
  status: "cloning" | "complete" | "error";
  message: string;
}

interface ValidationResult {
  valid: boolean;
  detected?: GitHubRepo | null;
  error?: string;
}

const sendCloneProgress = (
  win: BrowserWindow,
  cloneId: string,
  progress: CloneProgress,
) => {
  win.webContents.send(`clone-progress:${cloneId}`, progress);
};

export const parseGitHubUrl = (url: string): GitHubRepo | null => {
  const match =
    url.match(/github\.com[:/](.+?)\/(.+?)(\.git)?$/) ||
    url.match(/git@github\.com:(.+?)\/(.+?)(\.git)?$/);

  if (!match) return null;

  return {
    organization: match[1],
    repository: match[2].replace(/\.git$/, ""),
  };
};

export const isGitRepository = async (
  directoryPath: string,
): Promise<boolean> => {
  try {
    await execAsync("git rev-parse --is-inside-work-tree", {
      cwd: directoryPath,
    });
    return true;
  } catch {
    return false;
  }
};

export const getRemoteUrl = async (
  directoryPath: string,
): Promise<string | null> => {
  try {
    const { stdout } = await execAsync("git remote get-url origin", {
      cwd: directoryPath,
    });
    return stdout.trim();
  } catch {
    return null;
  }
};

export const getCurrentBranch = async (
  directoryPath: string,
): Promise<string | undefined> => {
  try {
    const { stdout } = await execAsync("git branch --show-current", {
      cwd: directoryPath,
    });
    return stdout.trim();
  } catch {
    return undefined;
  }
};

export const getDefaultBranch = async (
  directoryPath: string,
): Promise<string> => {
  try {
    // Try to get the default branch from origin
    const { stdout } = await execAsync(
      "git symbolic-ref refs/remotes/origin/HEAD",
      { cwd: directoryPath },
    );
    const branch = stdout.trim().replace("refs/remotes/origin/", "");
    return branch;
  } catch {
    // Fallback: check if main or master exists
    try {
      await execAsync("git rev-parse --verify main", {
        cwd: directoryPath,
      });
      return "main";
    } catch {
      return "master";
    }
  }
};

const getChangedFiles = async (directoryPath: string): Promise<Set<string>> => {
  const changedFiles = new Set<string>();

  try {
    const defaultBranch = await getDefaultBranch(directoryPath);
    const currentBranch = await getCurrentBranch(directoryPath);

    // Don't show changes if we're on the default branch
    if (currentBranch === defaultBranch) {
      return changedFiles;
    }

    // Get files that differ from default branch
    try {
      const { stdout: diffFiles } = await execAsync(
        `git diff --name-only ${defaultBranch}...HEAD`,
        { cwd: directoryPath },
      );
      const files = diffFiles.trim().split("\n").filter(Boolean);
      for (const file of files) {
        changedFiles.add(file);
      }
    } catch {
      // Branch might not exist or no common ancestor, skip
    }

    // Get modified files in working directory
    const { stdout: statusFiles } = await execAsync("git status --porcelain", {
      cwd: directoryPath,
    });
    const lines = statusFiles.trim().split("\n").filter(Boolean);
    for (const line of lines) {
      // Parse git status format: XY filename
      const fileName = line.substring(3).trim();
      if (fileName) {
        changedFiles.add(fileName);
      }
    }
  } catch (error) {
    log.error("Error getting changed files:", error);
  }

  return changedFiles;
};

export const getChangedFilesForRepo = getChangedFiles;

const getChangedFilesAgainstHead = async (
  directoryPath: string,
): Promise<ChangedFile[]> => {
  try {
    const files: ChangedFile[] = [];
    const seenPaths = new Set<string>();

    // Use git diff with -M to detect renames in working tree
    const { stdout: diffOutput } = await execAsync(
      "git diff -M --name-status HEAD",
      { cwd: directoryPath },
    );

    for (const line of diffOutput.trim().split("\n").filter(Boolean)) {
      // Format: STATUS\tPATH or STATUS\tOLD_PATH\tNEW_PATH for renames
      const parts = line.split("\t");
      const statusChar = parts[0][0]; // First char (ignore rename percentage like R100)

      if (statusChar === "R" && parts.length >= 3) {
        // Rename: R100\told-path\tnew-path
        const originalPath = parts[1];
        const newPath = parts[2];
        files.push({ path: newPath, status: "renamed", originalPath });
        seenPaths.add(newPath);
        seenPaths.add(originalPath);
      } else if (parts.length >= 2) {
        const filePath = parts[1];
        let status: GitFileStatus;
        switch (statusChar) {
          case "D":
            status = "deleted";
            break;
          case "A":
            status = "added";
            break;
          default:
            status = "modified";
        }
        files.push({ path: filePath, status });
        seenPaths.add(filePath);
      }
    }

    // Add untracked files from git status
    const { stdout: statusOutput } = await execAsync("git status --porcelain", {
      cwd: directoryPath,
    });

    for (const line of statusOutput.trim().split("\n").filter(Boolean)) {
      const statusCode = line.substring(0, 2);
      const filePath = line.substring(3);

      // Only add untracked files not already seen
      if (statusCode === "??" && !seenPaths.has(filePath)) {
        // Check if it's a directory (git shows directories with trailing /)
        if (filePath.endsWith("/")) {
          const dirPath = filePath.slice(0, -1);
          try {
            const dirFiles = await getAllFilesInDirectory(
              directoryPath,
              dirPath,
            );
            for (const file of dirFiles) {
              if (!seenPaths.has(file)) {
                files.push({ path: file, status: "untracked" });
              }
            }
          } catch {
            // Directory might not exist or be inaccessible
          }
        } else {
          files.push({ path: filePath, status: "untracked" });
        }
      }
    }

    return files;
  } catch {
    return [];
  }
};

const getFileAtHead = async (
  directoryPath: string,
  filePath: string,
): Promise<string | null> => {
  try {
    const { stdout } = await execAsync(`git show HEAD:"${filePath}"`, {
      cwd: directoryPath,
      maxBuffer: 10 * 1024 * 1024,
    });
    return stdout;
  } catch {
    return null;
  }
};

export interface DiffStats {
  filesChanged: number;
  linesAdded: number;
  linesRemoved: number;
}

const discardFileChanges = async (
  directoryPath: string,
  filePath: string,
  fileStatus: GitFileStatus,
): Promise<void> => {
  switch (fileStatus) {
    case "modified":
    case "deleted":
      await execAsync(`git checkout HEAD -- "${filePath}"`, {
        cwd: directoryPath,
      });
      break;
    case "added":
      await execAsync(`git rm -f "${filePath}"`, {
        cwd: directoryPath,
      });
      break;
    case "untracked":
      await execAsync(`git clean -f -- "${filePath}"`, {
        cwd: directoryPath,
      });
      break;
    case "renamed":
      // TODO: Restore the original file?
      await execAsync(`git checkout HEAD -- "${filePath}"`, {
        cwd: directoryPath,
      });
      break;
    default:
      throw new Error(`Unknown file status: ${fileStatus}`);
  }
};

const getDiffStats = async (directoryPath: string): Promise<DiffStats> => {
  try {
    // git diff --numstat HEAD shows: added\tremoved\tfilename
    const { stdout } = await execAsync("git diff --numstat HEAD", {
      cwd: directoryPath,
    });

    let linesAdded = 0;
    let linesRemoved = 0;
    let filesChanged = 0;

    for (const line of stdout.trim().split("\n").filter(Boolean)) {
      const parts = line.split("\t");
      if (parts.length >= 2) {
        // Binary files show "-" for added/removed
        const added = parts[0] === "-" ? 0 : parseInt(parts[0], 10);
        const removed = parts[1] === "-" ? 0 : parseInt(parts[1], 10);
        linesAdded += added;
        linesRemoved += removed;
        filesChanged++;
      }
    }

    // Also count untracked files
    const { stdout: statusOutput } = await execAsync("git status --porcelain", {
      cwd: directoryPath,
    });

    const countLinesInFile = async (filePath: string): Promise<number> => {
      try {
        const { stdout: wcOutput } = await execAsync(`wc -l < "${filePath}"`, {
          cwd: directoryPath,
        });
        return parseInt(wcOutput.trim(), 10) || 0;
      } catch {
        return 0;
      }
    };

    for (const line of statusOutput.trim().split("\n").filter(Boolean)) {
      const statusCode = line.substring(0, 2);
      if (statusCode === "??") {
        const filePath = line.substring(3);

        // Check if it's a directory (git shows directories with trailing /)
        if (filePath.endsWith("/")) {
          const dirPath = filePath.slice(0, -1);
          try {
            const dirFiles = await getAllFilesInDirectory(
              directoryPath,
              dirPath,
            );
            for (const file of dirFiles) {
              filesChanged++;
              linesAdded += await countLinesInFile(file);
            }
          } catch {
            // Directory might not exist or be inaccessible
          }
        } else {
          filesChanged++;
          linesAdded += await countLinesInFile(filePath);
        }
      }
    }

    return { filesChanged, linesAdded, linesRemoved };
  } catch {
    return { filesChanged: 0, linesAdded: 0, linesRemoved: 0 };
  }
};

export const findReposDirectory = async (): Promise<string | null> => {
  const platform = os.platform();

  if (platform === "win32") {
    return null;
  }

  const homeDir = os.homedir();

  const excludedPaths = [
    "Library",
    "Applications",
    ".Trash",
    "Music",
    "Movies",
    "Pictures",
    "Desktop",
    "Downloads",
  ];

  const excludeArgs = excludedPaths
    .map((p) => `-path "${path.join(homeDir, p)}"`)
    .join(" -o ");

  const command = `find "${homeDir}" -maxdepth 4 \\( ${excludeArgs} \\) -prune -o -type d -name .git -print 2>/dev/null | sed 's|/.git$||' | xargs -n1 dirname 2>/dev/null | sort | uniq -c | sort -rn | head -1 | awk '$1 >= 3 {print $2}'`;

  try {
    const { stdout } = await execAsync(command);
    const result = stdout.trim();

    return result || null;
  } catch {
    return null;
  }
};

export const detectSSHError = (output: string): string | undefined => {
  if (
    output.includes("successfully authenticated") ||
    output.includes("You've successfully authenticated")
  ) {
    return undefined;
  }

  if (output.includes("Permission denied")) {
    return "SSH keys not configured. Please add your SSH key to GitHub: https://github.com/settings/keys";
  }

  if (output.includes("Could not resolve hostname")) {
    return "Network error: Cannot reach github.com";
  }

  if (output.includes("Connection timed out")) {
    return "Connection timeout: Cannot reach github.com";
  }

  return `SSH test failed: ${output.substring(0, 200)}`;
};

export function registerGitIpc(
  getMainWindow: () => BrowserWindow | null,
): void {
  ipcMain.handle("find-repos-directory", async (): Promise<string | null> => {
    return findReposDirectory();
  });

  ipcMain.handle(
    "validate-repo",
    async (
      _event: IpcMainInvokeEvent,
      directoryPath: string,
    ): Promise<boolean> => {
      if (!directoryPath) return false;
      return isGitRepository(directoryPath);
    },
  );

  ipcMain.handle(
    "detect-repo",
    async (
      _event: IpcMainInvokeEvent,
      directoryPath: string,
    ): Promise<{
      organization: string;
      repository: string;
      branch?: string;
      remote?: string;
    } | null> => {
      if (!directoryPath) return null;

      const remoteUrl = await getRemoteUrl(directoryPath);
      if (!remoteUrl) return null;

      const repo = parseGitHubUrl(remoteUrl);
      if (!repo) return null;

      const branch = await getCurrentBranch(directoryPath);

      return { ...repo, branch, remote: remoteUrl };
    },
  );

  ipcMain.handle(
    "validate-repository-match",
    async (
      _event: IpcMainInvokeEvent,
      directoryPath: string,
      expectedOrg: string,
      expectedRepo: string,
    ): Promise<ValidationResult> => {
      if (!directoryPath) {
        return { valid: false, error: "No directory path provided" };
      }

      try {
        await fsPromises.access(directoryPath);
      } catch {
        return { valid: false, error: "Directory does not exist" };
      }

      if (!(await isGitRepository(directoryPath))) {
        return { valid: false, error: "Not a git repository" };
      }

      const remoteUrl = await getRemoteUrl(directoryPath);
      if (!remoteUrl) {
        return {
          valid: false,
          detected: null,
          error: "Could not detect GitHub repository",
        };
      }

      const detected = parseGitHubUrl(remoteUrl);
      if (!detected) {
        return {
          valid: false,
          detected: null,
          error: "Could not parse GitHub repository URL",
        };
      }

      const matches =
        detected.organization.toLowerCase() === expectedOrg.toLowerCase() &&
        detected.repository.toLowerCase() === expectedRepo.toLowerCase();

      return {
        valid: matches,
        detected,
        error: matches
          ? undefined
          : `Folder contains ${detected.organization}/${detected.repository}, expected ${expectedOrg}/${expectedRepo}`,
      };
    },
  );

  ipcMain.handle(
    "check-ssh-access",
    async (): Promise<{ available: boolean; error?: string }> => {
      try {
        const { stdout, stderr } = await execAsync(
          'ssh -T git@github.com -o BatchMode=yes -o StrictHostKeyChecking=accept-new -o ConnectTimeout=5 2>&1 || echo "SSH_TEST_COMPLETE"',
        );

        const output = stdout + stderr;
        const error = detectSSHError(output);

        return error ? { available: false, error } : { available: true };
      } catch (error) {
        return {
          available: false,
          error: `Failed to test SSH: ${error instanceof Error ? error.message : "Unknown error"}`,
        };
      }
    },
  );

  const activeClones = new Map<string, boolean>();

  const setupCloneProcess = (
    cloneId: string,
    repoUrl: string,
    targetPath: string,
    win: BrowserWindow,
  ): ChildProcess => {
    // Expand home directory for SSH config path
    const homeDir = os.homedir();
    const sshConfigPath = path.join(homeDir, ".ssh", "config");

    // Use GIT_SSH_COMMAND to ensure SSH uses the config file
    const env = {
      ...process.env,
      GIT_SSH_COMMAND: `ssh -F ${sshConfigPath}`,
    };

    const cloneProcess = exec(
      `git clone --progress "${repoUrl}" "${targetPath}"`,
      {
        maxBuffer: CLONE_MAX_BUFFER,
        env,
      },
    );

    sendCloneProgress(win, cloneId, {
      status: "cloning",
      message: `Cloning ${repoUrl}...`,
    });

    let stderrData = "";

    cloneProcess.stdout?.on("data", (data: Buffer) => {
      if (activeClones.get(cloneId)) {
        sendCloneProgress(win, cloneId, {
          status: "cloning",
          message: data.toString().trim(),
        });
      }
    });

    cloneProcess.stderr?.on("data", (data: Buffer) => {
      const text = data.toString();
      stderrData += text;

      if (activeClones.get(cloneId)) {
        // Parse progress from git output (e.g., "Receiving objects: 45% (6234/13948)")
        const progressMatch = text.match(/(\w+\s+\w+):\s+(\d+)%/);
        let progressMessage = text.trim();

        if (progressMatch) {
          const [, stage, percent] = progressMatch;
          progressMessage = `${stage}: ${percent}%`;
        }

        sendCloneProgress(win, cloneId, {
          status: "cloning",
          message: progressMessage,
        });
      }
    });

    cloneProcess.on("close", (code: number) => {
      if (!activeClones.get(cloneId)) return;

      const status = code === 0 ? "complete" : "error";
      const message =
        code === 0
          ? "Repository cloned successfully"
          : `Clone failed with exit code ${code}. stderr: ${stderrData}`;

      sendCloneProgress(win, cloneId, { status, message });
      activeClones.delete(cloneId);
    });

    cloneProcess.on("error", (error: Error) => {
      log.error("Process error:", error);
      if (activeClones.get(cloneId)) {
        sendCloneProgress(win, cloneId, {
          status: "error",
          message: `Clone error: ${error.message}`,
        });
        activeClones.delete(cloneId);
      }
    });

    return cloneProcess;
  };

  ipcMain.handle(
    "clone-repository",
    async (
      _event: IpcMainInvokeEvent,
      repoUrl: string,
      targetPath: string,
      cloneId: string,
    ): Promise<{ cloneId: string }> => {
      const win = getMainWindow();

      if (!win) throw new Error("Main window not available");

      activeClones.set(cloneId, true);
      setupCloneProcess(cloneId, repoUrl, targetPath, win);

      return { cloneId };
    },
  );

  ipcMain.handle(
    "get-changed-files-head",
    async (
      _event: IpcMainInvokeEvent,
      directoryPath: string,
    ): Promise<ChangedFile[]> => {
      return getChangedFilesAgainstHead(directoryPath);
    },
  );

  ipcMain.handle(
    "get-file-at-head",
    async (
      _event: IpcMainInvokeEvent,
      directoryPath: string,
      filePath: string,
    ): Promise<string | null> => {
      return getFileAtHead(directoryPath, filePath);
    },
  );

  ipcMain.handle(
    "get-diff-stats",
    async (
      _event: IpcMainInvokeEvent,
      directoryPath: string,
    ): Promise<DiffStats> => {
      return getDiffStats(directoryPath);
    },
  );

  ipcMain.handle(
    "get-current-branch",
    async (
      _event: IpcMainInvokeEvent,
      directoryPath: string,
    ): Promise<string | undefined> => {
      return getCurrentBranch(directoryPath);
    },
  );

  ipcMain.handle(
    "discard-file-changes",
    async (
      _event: IpcMainInvokeEvent,
      directoryPath: string,
      filePath: string,
      fileStatus: GitFileStatus,
    ): Promise<void> => {
      return discardFileChanges(directoryPath, filePath, fileStatus);
    },
  );
}
