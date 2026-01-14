/**
 * Git utility functions for internal main process use.
 * These are used by other services (FsService, FoldersService, WorkspaceService).
 * The public git API is exposed via GitService and tRPC router.
 */
import { exec } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { logger } from "../lib/logger";

const log = logger.scope("git");

const execAsync = promisify(exec);

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
    const { stdout } = await execAsync(
      "git symbolic-ref refs/remotes/origin/HEAD",
      { cwd: directoryPath },
    );
    const branch = stdout.trim().replace("refs/remotes/origin/", "");
    return branch;
  } catch {
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

    if (currentBranch === defaultBranch) {
      return changedFiles;
    }

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

    const { stdout: statusFiles } = await execAsync("git status --porcelain", {
      cwd: directoryPath,
    });
    const lines = statusFiles.trim().split("\n").filter(Boolean);
    for (const line of lines) {
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
