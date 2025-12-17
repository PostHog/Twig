import { exec, execFile, spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import { injectable } from "inversify";
import { TypedEventEmitter } from "../../lib/typed-event-emitter.js";
import type {
  ChangedFile,
  CloneProgressPayload,
  DetectRepoResult,
  DiffStats,
  GetCommitConventionsOutput,
  GetPrTemplateOutput,
  GitCommitInfo,
  GitFileStatus,
  GitRepoInfo,
  GitSyncStatus,
  PublishOutput,
  PullOutput,
  PushOutput,
  SyncOutput,
} from "./schemas.js";
import { parseGitHubUrl } from "./utils.js";

const execAsync = promisify(exec);
const execFileAsync = promisify(execFile);
const fsPromises = fs.promises;

export const GitServiceEvent = {
  CloneProgress: "cloneProgress",
} as const;

export interface GitServiceEvents {
  [GitServiceEvent.CloneProgress]: CloneProgressPayload;
}

@injectable()
export class GitService extends TypedEventEmitter<GitServiceEvents> {
  public async detectRepo(
    directoryPath: string,
  ): Promise<DetectRepoResult | null> {
    if (!directoryPath) return null;

    const remoteUrl = await this.getRemoteUrl(directoryPath);
    if (!remoteUrl) return null;

    const repo = await parseGitHubUrl(remoteUrl);
    if (!repo) return null;

    const branch = await this.getCurrentBranch(directoryPath);
    if (!branch) return null;

    return {
      organization: repo.organization,
      repository: repo.repository,
      remote: remoteUrl,
      branch,
    };
  }

  public async validateRepo(directoryPath: string): Promise<boolean> {
    if (!directoryPath) return false;

    try {
      await execAsync("git rev-parse --is-inside-work-tree", {
        cwd: directoryPath,
      });
      return true;
    } catch {
      return false;
    }
  }

  public async cloneRepository(
    repoUrl: string,
    targetPath: string,
    cloneId: string,
  ): Promise<{ cloneId: string }> {
    const emitProgress = (
      status: CloneProgressPayload["status"],
      message: string,
    ) => {
      this.emit(GitServiceEvent.CloneProgress, { cloneId, status, message });
    };

    emitProgress("cloning", `Starting clone of ${repoUrl}...`);

    const gitProcess = spawn(
      "git",
      ["clone", "--progress", repoUrl, targetPath],
      {
        stdio: ["ignore", "pipe", "pipe"],
      },
    );

    gitProcess.stderr.on("data", (data: Buffer) => {
      const output = data.toString();
      emitProgress("cloning", output.trim());
    });

    gitProcess.stdout.on("data", (data: Buffer) => {
      const output = data.toString();
      emitProgress("cloning", output.trim());
    });

    return new Promise((resolve, reject) => {
      gitProcess.on("close", (code) => {
        if (code === 0) {
          emitProgress("complete", "Clone completed successfully");
          resolve({ cloneId });
        } else {
          const errorMsg = `Clone failed with exit code ${code}`;
          emitProgress("error", errorMsg);
          reject(new Error(errorMsg));
        }
      });

      gitProcess.on("error", (err) => {
        const errorMsg = `Clone failed: ${err.message}`;
        emitProgress("error", errorMsg);
        reject(err);
      });
    });
  }

  public async getRemoteUrl(directoryPath: string): Promise<string | null> {
    try {
      const { stdout } = await execFileAsync(
        "git",
        ["remote", "get-url", "origin"],
        {
          cwd: directoryPath,
        },
      );
      return stdout.trim();
    } catch {
      return null;
    }
  }

  public async getCurrentBranch(directoryPath: string): Promise<string | null> {
    try {
      const { stdout } = await execFileAsync(
        "git",
        ["branch", "--show-current"],
        {
          cwd: directoryPath,
        },
      );
      return stdout.trim();
    } catch {
      return null;
    }
  }

  public async getDefaultBranch(directoryPath: string): Promise<string> {
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
  }

  public async getAllBranches(directoryPath: string): Promise<string[]> {
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
  }

  public async createBranch(
    directoryPath: string,
    branchName: string,
  ): Promise<void> {
    await execAsync(`git checkout -b "${branchName}"`, {
      cwd: directoryPath,
    });
  }

  public async getChangedFilesHead(
    directoryPath: string,
  ): Promise<ChangedFile[]> {
    try {
      const files: ChangedFile[] = [];
      const seenPaths = new Set<string>();

      const [nameStatusResult, numstatResult, statusResult] = await Promise.all(
        [
          execAsync("git diff -M --name-status HEAD", { cwd: directoryPath }),
          execAsync("git diff -M --numstat HEAD", { cwd: directoryPath }),
          execAsync("git status --porcelain", { cwd: directoryPath }),
        ],
      );

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
          if (filePath.includes(" => ")) {
            const renameParts = filePath.split(" => ");
            lineStats.set(renameParts[0], { added, removed });
            lineStats.set(renameParts[1], { added, removed });
          } else {
            lineStats.set(filePath, { added, removed });
          }
        }
      }

      for (const line of nameStatusResult.stdout
        .trim()
        .split("\n")
        .filter(Boolean)) {
        const parts = line.split("\t");
        const statusChar = parts[0][0];

        if (statusChar === "R" && parts.length >= 3) {
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

      for (const line of statusResult.stdout
        .trim()
        .split("\n")
        .filter(Boolean)) {
        const statusCode = line.substring(0, 2);
        const filePath = line.substring(3);

        if (statusCode === "??" && !seenPaths.has(filePath)) {
          if (filePath.endsWith("/")) {
            const dirPath = filePath.slice(0, -1);
            try {
              const dirFiles = await this.getAllFilesInDirectory(
                directoryPath,
                dirPath,
              );
              for (const file of dirFiles) {
                if (!seenPaths.has(file)) {
                  const lineCount = await this.countFileLines(
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
            const lineCount = await this.countFileLines(
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
  }

  public async getFileAtHead(
    directoryPath: string,
    filePath: string,
  ): Promise<string | null> {
    try {
      const { stdout } = await execAsync(`git show HEAD:"${filePath}"`, {
        cwd: directoryPath,
        maxBuffer: 10 * 1024 * 1024,
      });
      return stdout;
    } catch {
      return null;
    }
  }

  public async getDiffStats(directoryPath: string): Promise<DiffStats> {
    try {
      const { stdout } = await execAsync("git diff --numstat HEAD", {
        cwd: directoryPath,
      });

      let linesAdded = 0;
      let linesRemoved = 0;
      let filesChanged = 0;

      for (const line of stdout.trim().split("\n").filter(Boolean)) {
        const parts = line.split("\t");
        if (parts.length >= 2) {
          const added = parts[0] === "-" ? 0 : parseInt(parts[0], 10);
          const removed = parts[1] === "-" ? 0 : parseInt(parts[1], 10);
          linesAdded += added;
          linesRemoved += removed;
          filesChanged++;
        }
      }

      const { stdout: statusOutput } = await execAsync(
        "git status --porcelain",
        {
          cwd: directoryPath,
        },
      );

      for (const line of statusOutput.trim().split("\n").filter(Boolean)) {
        const statusCode = line.substring(0, 2);
        if (statusCode === "??") {
          const filePath = line.substring(3);

          if (filePath.endsWith("/")) {
            const dirPath = filePath.slice(0, -1);
            try {
              const dirFiles = await this.getAllFilesInDirectory(
                directoryPath,
                dirPath,
              );
              for (const file of dirFiles) {
                filesChanged++;
                linesAdded += await this.countFileLinesWithWc(
                  directoryPath,
                  file,
                );
              }
            } catch {
              // Directory might not exist or be inaccessible
            }
          } else {
            filesChanged++;
            linesAdded += await this.countFileLinesWithWc(
              directoryPath,
              filePath,
            );
          }
        }
      }

      return { filesChanged, linesAdded, linesRemoved };
    } catch {
      return { filesChanged: 0, linesAdded: 0, linesRemoved: 0 };
    }
  }

  public async discardFileChanges(
    directoryPath: string,
    filePath: string,
    fileStatus: GitFileStatus,
  ): Promise<void> {
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
        await execFileAsync("git", ["checkout", "HEAD", "--", filePath], {
          cwd: directoryPath,
        });
        break;
      default:
        throw new Error(`Unknown file status: ${fileStatus}`);
    }
  }

  public async getGitSyncStatus(directoryPath: string): Promise<GitSyncStatus> {
    try {
      const currentBranch = await this.getCurrentBranch(directoryPath);
      if (!currentBranch) {
        return {
          ahead: 0,
          behind: 0,
          hasRemote: false,
          currentBranch: null,
          isFeatureBranch: false,
        };
      }

      const defaultBranch = await this.getDefaultBranch(directoryPath);
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
    } catch {
      return {
        ahead: 0,
        behind: 0,
        hasRemote: false,
        currentBranch: null,
        isFeatureBranch: false,
      };
    }
  }

  public async getLatestCommit(
    directoryPath: string,
  ): Promise<GitCommitInfo | null> {
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
  }

  public async getGitRepoInfo(
    directoryPath: string,
  ): Promise<GitRepoInfo | null> {
    try {
      const remoteUrl = await this.getRemoteUrl(directoryPath);
      if (!remoteUrl) return null;

      const parsed = parseGitHubUrl(remoteUrl);
      if (!parsed) return null;

      const currentBranch = await this.getCurrentBranch(directoryPath);
      const defaultBranch = await this.getDefaultBranch(directoryPath);

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
  }

  public async push(
    directoryPath: string,
    remote = "origin",
    branch?: string,
    setUpstream = false,
  ): Promise<PushOutput> {
    try {
      const targetBranch =
        branch || (await this.getCurrentBranch(directoryPath));
      if (!targetBranch) {
        return { success: false, message: "No branch to push" };
      }

      const args = ["push"];
      if (setUpstream) {
        args.push("-u");
      }
      args.push(remote, targetBranch);

      const { stdout, stderr } = await execFileAsync("git", args, {
        cwd: directoryPath,
      });

      return {
        success: true,
        message: stdout || stderr || "Push successful",
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { success: false, message };
    }
  }

  public async pull(
    directoryPath: string,
    remote = "origin",
    branch?: string,
  ): Promise<PullOutput> {
    try {
      const targetBranch =
        branch || (await this.getCurrentBranch(directoryPath));
      const args = ["pull", remote];
      if (targetBranch) {
        args.push(targetBranch);
      }

      const { stdout, stderr } = await execFileAsync("git", args, {
        cwd: directoryPath,
      });

      // Parse number of files changed from output
      const output = stdout || stderr || "";
      const filesMatch = output.match(/(\d+) files? changed/);
      const updatedFiles = filesMatch ? parseInt(filesMatch[1], 10) : undefined;

      return {
        success: true,
        message: output || "Pull successful",
        updatedFiles,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { success: false, message };
    }
  }

  public async publish(
    directoryPath: string,
    remote = "origin",
  ): Promise<PublishOutput> {
    const currentBranch = await this.getCurrentBranch(directoryPath);
    if (!currentBranch) {
      return { success: false, message: "No branch to publish", branch: "" };
    }

    const result = await this.push(directoryPath, remote, currentBranch, true);
    return { ...result, branch: currentBranch };
  }

  public async sync(
    directoryPath: string,
    remote = "origin",
  ): Promise<SyncOutput> {
    const pullResult = await this.pull(directoryPath, remote);
    if (!pullResult.success) {
      return {
        success: false,
        pullMessage: pullResult.message,
        pushMessage: "Skipped due to pull failure",
      };
    }

    const pushResult = await this.push(directoryPath, remote);
    return {
      success: pushResult.success,
      pullMessage: pullResult.message,
      pushMessage: pushResult.message,
    };
  }

  public async getPrTemplate(
    directoryPath: string,
  ): Promise<GetPrTemplateOutput> {
    const templatePaths = [
      ".github/PULL_REQUEST_TEMPLATE.md",
      ".github/pull_request_template.md",
      "PULL_REQUEST_TEMPLATE.md",
      "pull_request_template.md",
      "docs/PULL_REQUEST_TEMPLATE.md",
    ];

    for (const relativePath of templatePaths) {
      const fullPath = path.join(directoryPath, relativePath);
      try {
        const content = await fsPromises.readFile(fullPath, "utf-8");
        return { template: content, templatePath: relativePath };
      } catch {
        // Template not found at this path, continue
      }
    }

    return { template: null, templatePath: null };
  }

  public async getCommitConventions(
    directoryPath: string,
    sampleSize = 20,
  ): Promise<GetCommitConventionsOutput> {
    try {
      const { stdout } = await execAsync(
        `git log --oneline -n ${sampleSize} --format="%s"`,
        { cwd: directoryPath },
      );

      const messages = stdout.trim().split("\n").filter(Boolean);

      // Check for conventional commit pattern: type(scope): message or type: message
      const conventionalPattern =
        /^(feat|fix|docs|style|refactor|test|chore|build|ci|perf|revert)(\(.+\))?:/;
      const conventionalCount = messages.filter((m) =>
        conventionalPattern.test(m),
      ).length;
      const conventionalCommits = conventionalCount > messages.length * 0.5;

      // Extract common prefixes
      const prefixes = messages
        .map((m) => m.match(/^([a-z]+)(\(.+\))?:/)?.[1])
        .filter((p): p is string => Boolean(p));
      const prefixCounts = prefixes.reduce(
        (acc, p) => {
          acc[p] = (acc[p] || 0) + 1;
          return acc;
        },
        {} as Record<string, number>,
      );
      const commonPrefixes = Object.entries(prefixCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([prefix]) => prefix);

      return {
        conventionalCommits,
        commonPrefixes,
        sampleMessages: messages.slice(0, 5),
      };
    } catch {
      return {
        conventionalCommits: false,
        commonPrefixes: [],
        sampleMessages: [],
      };
    }
  }

  // Private helper methods

  private async countFileLines(filePath: string): Promise<number> {
    try {
      const content = await fsPromises.readFile(filePath, "utf-8");
      if (!content) return 0;

      const lines = content.split("\n");
      return lines[lines.length - 1] === "" ? lines.length - 1 : lines.length;
    } catch {
      return 0;
    }
  }

  private async countFileLinesWithWc(
    directoryPath: string,
    filePath: string,
  ): Promise<number> {
    try {
      const { stdout } = await execAsync(`wc -l < "${filePath}"`, {
        cwd: directoryPath,
      });
      return parseInt(stdout.trim(), 10) || 0;
    } catch {
      return 0;
    }
  }

  private async getAllFilesInDirectory(
    directoryPath: string,
    basePath: string,
  ): Promise<string[]> {
    const files: string[] = [];
    const entries = await fsPromises.readdir(
      path.join(directoryPath, basePath),
      {
        withFileTypes: true,
      },
    );

    for (const entry of entries) {
      const relativePath = path.join(basePath, entry.name);
      if (entry.isDirectory()) {
        const subFiles = await this.getAllFilesInDirectory(
          directoryPath,
          relativePath,
        );
        files.push(...subFiles);
      } else {
        files.push(relativePath);
      }
    }

    return files;
  }
}
