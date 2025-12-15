import { exec, execFile } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import type { ChangedFile, GitFileStatus } from "@shared/types";
import { type IpcMainInvokeEvent, ipcMain } from "electron";
import { logger } from "../lib/logger";

const log = logger.scope("git");

const execAsync = promisify(exec);
const execFileAsync = promisify(execFile);
const fsPromises = fs.promises;

const countFileLines = async (filePath: string): Promise<number> => {
  try {
    const content = await fsPromises.readFile(filePath, "utf-8");
    if (!content) return 0;

    // Match git line counting: do not count trailing newline as extra line
    const lines = content.split("\n");
    return lines[lines.length - 1] === "" ? lines.length - 1 : lines.length;
  } catch {
    return 0;
  }
};

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

export interface GitHubRepo {
  organization: string;
  repository: string;
}

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

export const getAllBranches = async (
  directoryPath: string,
): Promise<string[]> => {
  try {
    const { stdout } = await execAsync(
      'git branch --list --format="%(refname:short)"',
      {
        cwd: directoryPath,
      },
    );
    return stdout
      .trim()
      .split("\n")
      .filter(Boolean)
      .map((branch) => branch.trim())
      .filter((branch) => !branch.startsWith("array/"));
  } catch {
    return [];
  }
};

export const createBranch = async (
  directoryPath: string,
  branchName: string,
): Promise<void> => {
  await execAsync(`git checkout -b "${branchName}"`, {
    cwd: directoryPath,
  });
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

    // Run git commands in parallel
    const [nameStatusResult, numstatResult, statusResult] = await Promise.all([
      execAsync("git diff -M --name-status HEAD", { cwd: directoryPath }),
      execAsync("git diff -M --numstat HEAD", { cwd: directoryPath }),
      execAsync("git status --porcelain", { cwd: directoryPath }),
    ]);

    // Build line stats map from numstat output
    // Format: ADDED\tREMOVED\tPATH or for renames: ADDED\tREMOVED\tOLD_PATH => NEW_PATH
    const lineStats = new Map<string, { added: number; removed: number }>();
    for (const line of numstatResult.stdout
      .trim()
      .split("\n")
      .filter(Boolean)) {
      const parts = line.split("\t");
      if (parts.length >= 3) {
        const added = parts[0] === "-" ? 0 : parseInt(parts[0], 10) || 0;
        const removed = parts[1] === "-" ? 0 : parseInt(parts[1], 10) || 0;
        const filePath = parts.slice(2).join("\t");
        // For renames, numstat shows "old => new" - extract both paths
        if (filePath.includes(" => ")) {
          const renameParts = filePath.split(" => ");
          // Store under both old and new path for lookup
          lineStats.set(renameParts[0], { added, removed });
          lineStats.set(renameParts[1], { added, removed });
        } else {
          lineStats.set(filePath, { added, removed });
        }
      }
    }

    // Parse name-status output for file status
    // Format: STATUS\tPATH or STATUS\tOLD_PATH\tNEW_PATH for renames
    for (const line of nameStatusResult.stdout
      .trim()
      .split("\n")
      .filter(Boolean)) {
      const parts = line.split("\t");
      const statusChar = parts[0][0]; // First char (ignore rename percentage like R100)

      if (statusChar === "R" && parts.length >= 3) {
        // Rename: R100\told-path\tnew-path
        const originalPath = parts[1];
        const newPath = parts[2];
        const stats = lineStats.get(newPath) || lineStats.get(originalPath);
        files.push({
          path: newPath,
          status: "renamed",
          originalPath,
          linesAdded: stats?.added,
          linesRemoved: stats?.removed,
        });
        seenPaths.add(newPath);
        seenPaths.add(originalPath);
      } else if (parts.length >= 2) {
        const filePath = parts[1];
        const stats = lineStats.get(filePath);
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
        files.push({
          path: filePath,
          status,
          linesAdded: stats?.added,
          linesRemoved: stats?.removed,
        });
        seenPaths.add(filePath);
      }
    }

    // Add untracked files from git status
    for (const line of statusResult.stdout.trim().split("\n").filter(Boolean)) {
      const statusCode = line.substring(0, 2);
      const filePath = line.substring(3);

      if (statusCode === "??" && !seenPaths.has(filePath)) {
        if (filePath.endsWith("/")) {
          const dirPath = filePath.slice(0, -1);
          try {
            const dirFiles = await getAllFilesInDirectory(
              directoryPath,
              dirPath,
            );
            for (const file of dirFiles) {
              if (!seenPaths.has(file)) {
                const lineCount = await countFileLines(
                  path.join(directoryPath, file),
                );
                files.push({
                  path: file,
                  status: "untracked",
                  linesAdded: lineCount || undefined,
                });
              }
            }
          } catch {
            // Directory might not exist or be inaccessible
          }
        } else {
          const lineCount = await countFileLines(
            path.join(directoryPath, filePath),
          );
          files.push({
            path: filePath,
            status: "untracked",
            linesAdded: lineCount || undefined,
          });
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

export interface GitSyncStatus {
  ahead: number;
  behind: number;
  hasRemote: boolean;
  currentBranch: string | null;
  isFeatureBranch: boolean;
}

export interface GitCommitInfo {
  sha: string;
  shortSha: string;
  message: string;
  author: string;
  date: string;
}

export interface GitRepoInfo {
  organization: string;
  repository: string;
  currentBranch: string | null;
  defaultBranch: string;
  compareUrl: string | null;
}

const getLatestCommit = async (
  directoryPath: string,
): Promise<GitCommitInfo | null> => {
  try {
    const { stdout } = await execAsync(
      'git log -1 --format="%H|%h|%s|%an|%aI"',
      { cwd: directoryPath },
    );

    const [sha, shortSha, message, author, date] = stdout.trim().split("|");
    if (!sha) return null;

    return { sha, shortSha, message, author, date };
  } catch {
    return null;
  }
};

const getGitRepoInfo = async (
  directoryPath: string,
): Promise<GitRepoInfo | null> => {
  try {
    const remoteUrl = await getRemoteUrl(directoryPath);
    if (!remoteUrl) return null;

    const parsed = parseGitHubUrl(remoteUrl);
    if (!parsed) return null;

    const currentBranch = await getCurrentBranch(directoryPath);
    const defaultBranch = await getDefaultBranch(directoryPath);

    let compareUrl: string | null = null;
    if (currentBranch && currentBranch !== defaultBranch) {
      compareUrl = `https://github.com/${parsed.organization}/${parsed.repository}/compare/${defaultBranch}...${currentBranch}?expand=1`;
    }

    return {
      organization: parsed.organization,
      repository: parsed.repository,
      currentBranch: currentBranch ?? null,
      defaultBranch,
      compareUrl,
    };
  } catch {
    return null;
  }
};

const getGitSyncStatus = async (
  directoryPath: string,
): Promise<GitSyncStatus> => {
  try {
    const currentBranch = await getCurrentBranch(directoryPath);
    if (!currentBranch) {
      return {
        ahead: 0,
        behind: 0,
        hasRemote: false,
        currentBranch: null,
        isFeatureBranch: false,
      };
    }

    const defaultBranch = await getDefaultBranch(directoryPath);
    const isFeatureBranch = currentBranch !== defaultBranch;

    try {
      const { stdout: upstream } = await execAsync(
        `git rev-parse --abbrev-ref ${currentBranch}@{upstream}`,
        { cwd: directoryPath },
      );

      const upstreamBranch = upstream.trim();
      if (!upstreamBranch) {
        return {
          ahead: 0,
          behind: 0,
          hasRemote: false,
          currentBranch,
          isFeatureBranch,
        };
      }

      // Use --quiet to suppress output, ignore errors (network may be unavailable)
      try {
        await execAsync("git fetch --quiet", {
          cwd: directoryPath,
          timeout: 10000,
        });
      } catch {
        // Fetch failed (likely offline), continue with stale data
      }

      const { stdout: revList } = await execAsync(
        `git rev-list --left-right --count ${currentBranch}...${upstreamBranch}`,
        { cwd: directoryPath },
      );

      const [ahead, behind] = revList.trim().split("\t").map(Number);

      return {
        ahead: ahead || 0,
        behind: behind || 0,
        hasRemote: true,
        currentBranch,
        isFeatureBranch,
      };
    } catch {
      return {
        ahead: 0,
        behind: 0,
        hasRemote: false,
        currentBranch,
        isFeatureBranch,
      };
    }
  } catch (error) {
    log.error("Error getting git sync status:", error);
    return {
      ahead: 0,
      behind: 0,
      hasRemote: false,
      currentBranch: null,
      isFeatureBranch: false,
    };
  }
};

const discardFileChanges = async (
  directoryPath: string,
  filePath: string,
  fileStatus: GitFileStatus,
): Promise<void> => {
  switch (fileStatus) {
    case "modified":
    case "deleted":
      await execFileAsync("git", ["checkout", "HEAD", "--", filePath], {
        cwd: directoryPath,
      });
      break;
    case "added":
      await execFileAsync("git", ["rm", "-f", filePath], {
        cwd: directoryPath,
      });
      break;
    case "untracked":
      await execFileAsync("git", ["clean", "-f", "--", filePath], {
        cwd: directoryPath,
      });
      break;
    case "renamed":
      // TODO: Restore the original file?
      await execFileAsync("git", ["checkout", "HEAD", "--", filePath], {
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

export function registerGitIpc(): void {
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
    "get-default-branch",
    async (
      _event: IpcMainInvokeEvent,
      directoryPath: string,
    ): Promise<string> => {
      return getDefaultBranch(directoryPath);
    },
  );

  ipcMain.handle(
    "get-all-branches",
    async (
      _event: IpcMainInvokeEvent,
      directoryPath: string,
    ): Promise<string[]> => {
      return getAllBranches(directoryPath);
    },
  );

  ipcMain.handle(
    "create-branch",
    async (
      _event: IpcMainInvokeEvent,
      directoryPath: string,
      branchName: string,
    ): Promise<void> => {
      return createBranch(directoryPath, branchName);
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

  ipcMain.handle(
    "get-git-sync-status",
    async (
      _event: IpcMainInvokeEvent,
      directoryPath: string,
    ): Promise<GitSyncStatus> => {
      return getGitSyncStatus(directoryPath);
    },
  );

  ipcMain.handle(
    "get-latest-commit",
    async (
      _event: IpcMainInvokeEvent,
      directoryPath: string,
    ): Promise<GitCommitInfo | null> => {
      return getLatestCommit(directoryPath);
    },
  );

  ipcMain.handle(
    "get-git-repo-info",
    async (
      _event: IpcMainInvokeEvent,
      directoryPath: string,
    ): Promise<GitRepoInfo | null> => {
      return getGitRepoInfo(directoryPath);
    },
  );
}
