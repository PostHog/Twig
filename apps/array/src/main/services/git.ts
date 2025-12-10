import { type ChildProcess, exec, execFile } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import type { ChangedFile, GitFileStatus } from "@shared/types";
import { type BrowserWindow, type IpcMainInvokeEvent, ipcMain } from "electron";
import { logger } from "../lib/logger";

const log = logger.scope("git");

const execAsync = promisify(exec);
const execFileAsync = promisify(execFile);
const fsPromises = fs.promises;

// GitHub API response types
interface GitHubUser {
  login: string;
  id: number;
}

interface GitHubComment {
  id: number;
  path: string;
  line: number;
  side: string;
  body: string;
  user: GitHubUser;
  created_at: string;
  updated_at: string;
}

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

const getRepositoryFromRemoteUrl = async (
  directoryPath: string,
): Promise<string> => {
  const remoteUrl = await getRemoteUrl(directoryPath);
  if (!remoteUrl) {
    throw new Error("No remote URL found");
  }

  // Parse repo from URL (handles both HTTPS and SSH formats)
  const repoMatch = remoteUrl.match(
    /github\.com[:/]([^/]+\/[^/]+?)(?:\.git)?$/,
  );
  if (!repoMatch) {
    throw new Error(`Cannot parse repository from URL: ${remoteUrl}`);
  }

  return repoMatch[1];
};

const validatePullRequestNumber = (prNumber: number): void => {
  if (
    typeof prNumber !== "number" ||
    !Number.isInteger(prNumber) ||
    prNumber < 1
  ) {
    throw new Error(`Invalid pull request number: ${prNumber}`);
  }
};

const validateCommentId = (commentId: number): void => {
  if (
    typeof commentId !== "number" ||
    !Number.isInteger(commentId) ||
    commentId < 1
  ) {
    throw new Error(`Invalid comment ID: ${commentId}`);
  }
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

export const getHeadCommitSha = async (
  directoryPath: string,
): Promise<string> => {
  try {
    const { stdout } = await execAsync("git rev-parse HEAD", {
      cwd: directoryPath,
    });
    return stdout.trim();
  } catch (error) {
    throw new Error(`Failed to get HEAD commit SHA: ${error}`);
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

const getPullRequestReviewComments = async (
  directoryPath: string,
  prNumber: number,
): Promise<GitHubComment[]> => {
  validatePullRequestNumber(prNumber);

  try {
    const repo = await getRepositoryFromRemoteUrl(directoryPath);

    // TODO: Paginate if many comments
    const { stdout } = await execAsync(
      `gh api repos/${repo}/pulls/${prNumber}/comments`,
      { cwd: directoryPath },
    );
    return JSON.parse(stdout);
  } catch (error) {
    throw new Error(`Failed to fetch PR review comments: ${error}`);
  }
};

interface AddPullRequestCommentOptions {
  body: string;
  commitId: string;
  path: string;
  line: number;
  side?: "LEFT" | "RIGHT";
}

const addPullRequestComment = async (
  directoryPath: string,
  prNumber: number,
  options: AddPullRequestCommentOptions,
): Promise<GitHubComment> => {
  validatePullRequestNumber(prNumber);

  // Validate required options
  if (!options.body || !options.commitId || !options.path) {
    throw new Error("body, commitId, and path are required");
  }

  if (typeof options.line !== "number" || options.line < 1) {
    throw new Error("line must be a positive number");
  }

  try {
    const repo = await getRepositoryFromRemoteUrl(directoryPath);
    const side = options.side || "RIGHT";

    const { stdout } = await execAsync(
      `gh api repos/${repo}/pulls/${prNumber}/comments ` +
        `-f body="${options.body.replace(/"/g, '\\"')}" ` +
        `-f commit_id="${options.commitId}" ` +
        `-f path="${options.path}" ` +
        `-F line=${options.line} ` +
        `-f side="${side}"`,
      { cwd: directoryPath },
    );
    return JSON.parse(stdout);
  } catch (error) {
    throw new Error(`Failed to add PR comment: ${error}`);
  }
};

interface ReplyPullRequestCommentOptions {
  body: string;
  inReplyTo: number; // The comment ID to reply to
}

const replyToPullRequestComment = async (
  directoryPath: string,
  prNumber: number,
  options: ReplyPullRequestCommentOptions,
): Promise<GitHubComment> => {
  validatePullRequestNumber(prNumber);
  validateCommentId(options.inReplyTo);

  if (!options.body || options.body.trim().length === 0) {
    throw new Error("Reply body cannot be empty");
  }

  try {
    const repo = await getRepositoryFromRemoteUrl(directoryPath);

    // First, get the original comment to extract necessary details
    const { stdout: originalCommentOutput } = await execAsync(
      `gh api repos/${repo}/pulls/comments/${options.inReplyTo}`,
      { cwd: directoryPath },
    );

    const originalComment = JSON.parse(originalCommentOutput);

    // Create a reply comment using the same commit, path, and line as the original
    const { stdout } = await execAsync(
      `gh api repos/${repo}/pulls/${prNumber}/comments ` +
        `-f body="${options.body.replace(/"/g, '\\"')}" ` +
        `-f commit_id="${originalComment.commit_id}" ` +
        `-f path="${originalComment.path}" ` +
        `-F line=${originalComment.line} ` +
        `-f side="${originalComment.side}" ` +
        `-F in_reply_to=${options.inReplyTo}`,
      { cwd: directoryPath },
    );

    return JSON.parse(stdout);
  } catch (error) {
    throw new Error(`Failed to reply to PR comment: ${error}`);
  }
};

const updatePullRequestComment = async (
  directoryPath: string,
  commentId: number,
  content: string,
): Promise<GitHubComment> => {
  validateCommentId(commentId);

  if (!content || content.trim().length === 0) {
    throw new Error("Comment content cannot be empty");
  }

  try {
    const repo = await getRepositoryFromRemoteUrl(directoryPath);

    const { stdout } = await execAsync(
      `gh api repos/${repo}/pulls/comments/${commentId} -X PATCH -f body="${content.replace(/"/g, '\\"')}"`,
      { cwd: directoryPath },
    );

    return JSON.parse(stdout);
  } catch (error) {
    throw new Error(`Failed to update PR comment: ${error}`);
  }
};

const deletePullRequestComment = async (
  directoryPath: string,
  commentId: number,
): Promise<void> => {
  validateCommentId(commentId);

  try {
    const repo = await getRepositoryFromRemoteUrl(directoryPath);

    await execAsync(
      `gh api repos/${repo}/pulls/comments/${commentId} -X DELETE`,
      { cwd: directoryPath },
    );
  } catch (error) {
    throw new Error(`Failed to delete PR comment: ${error}`);
  }
};

interface PullRequestInfo {
  number: number;
  url: string;
  title: string;
  state: string;
}

const getPullRequestForBranch = async (
  directoryPath: string,
): Promise<PullRequestInfo | null> => {
  try {
    const { stdout } = await execAsync(
      "gh pr view --json number,url,title,state",
      { cwd: directoryPath },
    );
    return JSON.parse(stdout);
  } catch {
    // No PR exists for this branch
    return null;
  }
};

const resolvePullRequestComment = async (
  directoryPath: string,
  prNumber: number,
  commentId: number,
  resolved: boolean,
): Promise<GitHubComment & { resolved: boolean }> => {
  validateCommentId(commentId);
  validatePullRequestNumber(prNumber);

  try {
    const repo = await getRepositoryFromRemoteUrl(directoryPath);

    // Find the thread ID for this comment using GraphQL
    const { stdout: threadsOutput } = await execAsync(
      `gh api graphql -f query='
        query {
          repository(owner: "${repo.split("/")[0]}", name: "${repo.split("/")[1]}") {
            pullRequest(number: ${prNumber}) {
              reviewThreads(first: 100) {
                nodes {
                  id
                  isResolved
                  comments(first: 100) {
                    nodes {
                      databaseId
                    }
                  }
                }
              }
            }
          }
        }
      '`,
      { cwd: directoryPath },
    );

    const threadsData = JSON.parse(threadsOutput);
    const threads = threadsData.data.repository.pullRequest.reviewThreads.nodes;

    // Find the thread containing this comment
    const thread = threads.find(
      (t: { comments: { nodes: { databaseId: number }[] } }) =>
        t.comments.nodes.some(
          (c: { databaseId: number }) => c.databaseId === commentId,
        ),
    );

    if (!thread) {
      throw new Error(`No thread found for comment ${commentId}`);
    }

    // Resolve or unresolve the thread using GraphQL mutation
    const mutation = resolved ? "resolveReviewThread" : "unresolveReviewThread";
    const { stdout: mutationOutput } = await execAsync(
      `gh api graphql -f query='
        mutation {
          ${mutation}(input: {threadId: "${thread.id}"}) {
            thread {
              id
              isResolved
            }
          }
        }
      '`,
      { cwd: directoryPath },
    );

    const mutationData = JSON.parse(mutationOutput);
    const isResolved = mutationData.data[mutation].thread.isResolved;

    // Fetch the updated comment to return
    const { stdout: commentOutput } = await execAsync(
      `gh api repos/${repo}/pulls/comments/${commentId}`,
      { cwd: directoryPath },
    );

    const updatedComment = JSON.parse(commentOutput);
    return {
      ...updatedComment,
      resolved: isResolved,
    };
  } catch (error) {
    throw new Error(`Failed to resolve PR comment: ${error}`);
  }
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
    "get-head-commit-sha",
    async (
      _event: IpcMainInvokeEvent,
      directoryPath: string,
    ): Promise<string> => {
      return getHeadCommitSha(directoryPath);
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
    "get-pr-review-comments",
    async (
      _event: IpcMainInvokeEvent,
      directoryPath: string,
      prNumber: number,
    ): Promise<GitHubComment[]> => {
      return getPullRequestReviewComments(directoryPath, prNumber);
    },
  );

  ipcMain.handle(
    "add-pr-comment",
    async (
      _event: IpcMainInvokeEvent,
      directoryPath: string,
      prNumber: number,
      options: AddPullRequestCommentOptions,
    ): Promise<GitHubComment> => {
      return addPullRequestComment(directoryPath, prNumber, options);
    },
  );

  ipcMain.handle(
    "reply-pr-review",
    async (
      _event: IpcMainInvokeEvent,
      directoryPath: string,
      prNumber: number,
      options: ReplyPullRequestCommentOptions,
    ): Promise<GitHubComment> => {
      return replyToPullRequestComment(directoryPath, prNumber, options);
    },
  );

  ipcMain.handle(
    "update-pr-comment",
    async (
      _event: IpcMainInvokeEvent,
      directoryPath: string,
      commentId: number,
      content: string,
    ): Promise<GitHubComment> => {
      return updatePullRequestComment(directoryPath, commentId, content);
    },
  );

  ipcMain.handle(
    "delete-pr-comment",
    async (
      _event: IpcMainInvokeEvent,
      directoryPath: string,
      commentId: number,
    ): Promise<void> => {
      return deletePullRequestComment(directoryPath, commentId);
    },
  );

  ipcMain.handle(
    "resolve-pr-comment",
    async (
      _event: IpcMainInvokeEvent,
      directoryPath: string,
      prNumber: number,
      commentId: number,
      resolved: boolean,
    ): Promise<GitHubComment & { resolved: boolean }> => {
      return resolvePullRequestComment(
        directoryPath,
        prNumber,
        commentId,
        resolved,
      );
    },
  );

  ipcMain.handle(
    "get-pr-for-branch",
    async (
      _event: IpcMainInvokeEvent,
      directoryPath: string,
    ): Promise<PullRequestInfo | null> => {
      return getPullRequestForBranch(directoryPath);
    },
  );
}
