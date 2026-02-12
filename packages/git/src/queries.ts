import * as fs from "node:fs/promises";
import * as path from "node:path";
import type { CreateGitClientOptions } from "./client.js";
import { getGitOperationManager } from "./operation-manager.js";

export interface WorktreeListEntry {
  path: string;
  head: string;
  branch: string | null;
}

export interface AheadBehind {
  ahead: number;
  behind: number;
}

export interface GitStatus {
  isClean: boolean;
  staged: string[];
  modified: string[];
  deleted: string[];
  untracked: string[];
}

type GitLike = {
  raw: (args: string[]) => Promise<string>;
  revparse: (args: string[]) => Promise<string>;
};

export async function detectDefaultBranch(git: GitLike): Promise<string> {
  try {
    const remoteBranch = await git.raw([
      "symbolic-ref",
      "refs/remotes/origin/HEAD",
    ]);
    return remoteBranch.trim().replace("refs/remotes/origin/", "");
  } catch {
    try {
      await git.revparse(["--verify", "main"]);
      return "main";
    } catch {
      try {
        await git.revparse(["--verify", "master"]);
        return "master";
      } catch {
        throw new Error("Cannot determine default branch");
      }
    }
  }
}

async function detectDefaultBranchWithFallback(git: GitLike): Promise<string> {
  try {
    return await detectDefaultBranch(git);
  } catch {
    return "main";
  }
}

export async function getCurrentBranch(
  baseDir: string,
  options?: CreateGitClientOptions,
): Promise<string | null> {
  const manager = getGitOperationManager();
  return manager.executeRead(
    baseDir,
    async (git) => {
      const branch = await git.revparse(["--abbrev-ref", "HEAD"]);
      return branch === "HEAD" ? null : branch;
    },
    { signal: options?.abortSignal },
  );
}

export async function getDefaultBranch(
  baseDir: string,
  options?: CreateGitClientOptions,
): Promise<string> {
  const manager = getGitOperationManager();
  return manager.executeRead(baseDir, detectDefaultBranch, {
    signal: options?.abortSignal,
  });
}

export async function getRemoteUrl(
  baseDir: string,
  remote = "origin",
  options?: CreateGitClientOptions,
): Promise<string | null> {
  const manager = getGitOperationManager();
  return manager.executeRead(
    baseDir,
    async (git) => {
      try {
        const url = await git.remote(["get-url", remote]);
        return url || null;
      } catch {
        return null;
      }
    },
    { signal: options?.abortSignal },
  );
}

export async function getStatus(
  baseDir: string,
  options?: CreateGitClientOptions,
): Promise<GitStatus> {
  const manager = getGitOperationManager();
  return manager.executeRead(
    baseDir,
    async (git) => {
      const status = await git.status();
      return {
        isClean: status.isClean(),
        staged: status.staged,
        modified: status.modified,
        deleted: status.deleted,
        untracked: status.not_added,
      };
    },
    { signal: options?.abortSignal },
  );
}

export async function hasChanges(
  baseDir: string,
  options?: CreateGitClientOptions,
): Promise<boolean> {
  const manager = getGitOperationManager();
  return manager.executeRead(
    baseDir,
    async (git) => {
      const status = await git.status();
      return !status.isClean();
    },
    { signal: options?.abortSignal },
  );
}

export async function getAheadBehind(
  baseDir: string,
  options?: CreateGitClientOptions,
): Promise<AheadBehind | null> {
  const manager = getGitOperationManager();
  return manager.executeRead(
    baseDir,
    async (git) => {
      const branchOutput = await git.revparse(["--abbrev-ref", "HEAD"]);
      const branch = branchOutput === "HEAD" ? null : branchOutput;
      if (!branch) return null;

      try {
        await git.raw(["rev-parse", "--abbrev-ref", `${branch}@{upstream}`]);
      } catch {
        return null;
      }

      const status = await git.status();
      return {
        ahead: status.ahead,
        behind: status.behind,
      };
    },
    { signal: options?.abortSignal },
  );
}

export async function branchExists(
  baseDir: string,
  branchName: string,
  options?: CreateGitClientOptions,
): Promise<boolean> {
  const manager = getGitOperationManager();
  return manager.executeRead(
    baseDir,
    async (git) => {
      try {
        await git.revparse(["--verify", branchName]);
        return true;
      } catch {
        return false;
      }
    },
    { signal: options?.abortSignal },
  );
}

export async function listWorktrees(
  baseDir: string,
  options?: CreateGitClientOptions,
): Promise<WorktreeListEntry[]> {
  const manager = getGitOperationManager();
  return manager.executeRead(
    baseDir,
    async (git) => {
      const output = await git.raw(["worktree", "list", "--porcelain"]);
      const worktrees: WorktreeListEntry[] = [];
      let current: Partial<WorktreeListEntry> = {};

      for (const line of output.split("\n")) {
        if (line.startsWith("worktree ")) {
          if (current.path) {
            worktrees.push(current as WorktreeListEntry);
          }
          current = { path: line.slice(9), branch: null };
        } else if (line.startsWith("HEAD ")) {
          current.head = line.slice(5);
        } else if (line.startsWith("branch ")) {
          current.branch = line.slice(7).replace("refs/heads/", "");
        } else if (line === "detached") {
          current.branch = null;
        }
      }

      if (current.path) {
        worktrees.push(current as WorktreeListEntry);
      }

      return worktrees;
    },
    { signal: options?.abortSignal },
  );
}

export async function getFileAtHead(
  baseDir: string,
  filePath: string,
  options?: CreateGitClientOptions,
): Promise<string | null> {
  const manager = getGitOperationManager();
  return manager.executeRead(
    baseDir,
    async (git) => {
      try {
        return await git.show([`HEAD:${filePath}`]);
      } catch {
        return null;
      }
    },
    { signal: options?.abortSignal },
  );
}

export async function getHeadSha(
  baseDir: string,
  options?: CreateGitClientOptions,
): Promise<string> {
  const manager = getGitOperationManager();
  return manager.executeRead(baseDir, (git) => git.revparse(["HEAD"]), {
    signal: options?.abortSignal,
  });
}

export async function isDetachedHead(
  baseDir: string,
  options?: CreateGitClientOptions,
): Promise<boolean> {
  const branch = await getCurrentBranch(baseDir, options);
  return branch === null;
}

export async function isGitRepository(
  baseDir: string,
  options?: CreateGitClientOptions,
): Promise<boolean> {
  const manager = getGitOperationManager();
  return manager.executeRead(
    baseDir,
    async (git) => {
      try {
        await git.revparse(["--is-inside-work-tree"]);
        return true;
      } catch {
        return false;
      }
    },
    { signal: options?.abortSignal },
  );
}

export async function getChangedFiles(
  baseDir: string,
  options?: CreateGitClientOptions,
): Promise<Set<string>> {
  const manager = getGitOperationManager();
  return manager.executeRead(
    baseDir,
    async (git) => {
      const changedFiles = new Set<string>();

      try {
        const defaultBranch = await detectDefaultBranchWithFallback(git);
        const branchOutput = await git.revparse(["--abbrev-ref", "HEAD"]);
        const currentBranch = branchOutput === "HEAD" ? null : branchOutput;

        if (currentBranch && currentBranch !== defaultBranch) {
          try {
            const diffOutput = await git.diff([
              "--name-only",
              `${defaultBranch}...HEAD`,
            ]);
            for (const file of diffOutput.split("\n").filter(Boolean)) {
              changedFiles.add(file);
            }
          } catch {}
        }

        const status = await git.status();
        for (const file of [
          ...status.modified,
          ...status.created,
          ...status.deleted,
          ...status.renamed.map((r) => r.to),
          ...status.not_added,
        ]) {
          changedFiles.add(file);
        }
      } catch {}

      return changedFiles;
    },
    { signal: options?.abortSignal },
  );
}

export async function getAllBranches(
  baseDir: string,
  options?: CreateGitClientOptions,
): Promise<string[]> {
  const manager = getGitOperationManager();
  return manager.executeRead(
    baseDir,
    async (git) => {
      try {
        const summary = await git.branchLocal();
        return summary.all;
      } catch {
        return [];
      }
    },
    { signal: options?.abortSignal },
  );
}

export type GitFileStatus =
  | "modified"
  | "added"
  | "deleted"
  | "renamed"
  | "untracked";

export interface ChangedFileInfo {
  path: string;
  status: GitFileStatus;
  originalPath?: string;
  linesAdded?: number;
  linesRemoved?: number;
}

export interface GetChangedFilesDetailedOptions extends CreateGitClientOptions {
  excludePatterns?: string[];
}

function matchesExcludePattern(filePath: string, patterns: string[]): boolean {
  return patterns.some((pattern) => {
    if (pattern.startsWith("/")) {
      return (
        filePath === pattern.slice(1) ||
        filePath.startsWith(`${pattern.slice(1)}/`)
      );
    }
    return filePath === pattern || filePath.startsWith(`${pattern}/`);
  });
}

async function countFileLines(filePath: string): Promise<number> {
  try {
    const content = await fs.readFile(filePath, "utf-8");
    if (!content) return 0;
    return content.split("\n").length - (content.endsWith("\n") ? 1 : 0);
  } catch {
    return 0;
  }
}

export async function getChangedFilesDetailed(
  baseDir: string,
  options?: GetChangedFilesDetailedOptions,
): Promise<ChangedFileInfo[]> {
  const { excludePatterns, ...gitOptions } = options ?? {};
  const manager = getGitOperationManager();

  return manager.executeRead(
    baseDir,
    async (git) => {
      try {
        const [diffSummary, status] = await Promise.all([
          git.diffSummary(["-M", "HEAD"]),
          git.status(),
        ]);

        const seenPaths = new Set<string>();
        const files: ChangedFileInfo[] = [];

        for (const file of diffSummary.files) {
          if (
            excludePatterns &&
            matchesExcludePattern(file.file, excludePatterns)
          ) {
            seenPaths.add(file.file);
            continue;
          }

          const hasFrom = "from" in file && file.from;
          const isBinary = file.binary;
          files.push({
            path: file.file,
            status: hasFrom
              ? "renamed"
              : status.deleted.includes(file.file)
                ? "deleted"
                : status.created.includes(file.file)
                  ? "added"
                  : "modified",
            originalPath: hasFrom ? (file.from as string) : undefined,
            linesAdded: isBinary
              ? undefined
              : (file as { insertions: number }).insertions,
            linesRemoved: isBinary
              ? undefined
              : (file as { deletions: number }).deletions,
          });
          seenPaths.add(file.file);
          if (hasFrom) seenPaths.add(file.from as string);
        }

        for (const file of status.not_added) {
          if (!seenPaths.has(file)) {
            if (
              excludePatterns &&
              matchesExcludePattern(file, excludePatterns)
            ) {
              continue;
            }
            const lineCount = await countFileLines(path.join(baseDir, file));
            files.push({
              path: file,
              status: "untracked",
              linesAdded: lineCount,
              linesRemoved: 0,
            });
          }
        }

        return files;
      } catch {
        return [];
      }
    },
    { signal: gitOptions?.abortSignal },
  );
}

export interface DiffStats {
  filesChanged: number;
  linesAdded: number;
  linesRemoved: number;
}

export interface GetDiffStatsOptions extends CreateGitClientOptions {
  excludePatterns?: string[];
}

export function computeDiffStatsFromFiles(files: ChangedFileInfo[]): DiffStats {
  let linesAdded = 0;
  let linesRemoved = 0;

  for (const file of files) {
    linesAdded += file.linesAdded ?? 0;
    linesRemoved += file.linesRemoved ?? 0;
  }

  return {
    filesChanged: files.length,
    linesAdded,
    linesRemoved,
  };
}

export async function getDiffStats(
  baseDir: string,
  options?: GetDiffStatsOptions,
): Promise<DiffStats> {
  const files = await getChangedFilesDetailed(baseDir, options);
  return computeDiffStatsFromFiles(files);
}

export interface SyncStatus {
  ahead: number;
  behind: number;
  hasRemote: boolean;
  currentBranch: string | null;
  isFeatureBranch: boolean;
}

export async function getSyncStatus(
  baseDir: string,
  options?: CreateGitClientOptions,
): Promise<SyncStatus> {
  const manager = getGitOperationManager();
  return manager.executeRead(
    baseDir,
    async (git) => {
      try {
        const status = await git.status();
        const currentBranch = status.current || null;

        if (!currentBranch) {
          return {
            ahead: 0,
            behind: 0,
            hasRemote: false,
            currentBranch: null,
            isFeatureBranch: false,
          };
        }

        const defaultBranch = await detectDefaultBranchWithFallback(git);
        const hasRemote = status.tracking !== null;
        const isWorkspaceBranch = currentBranch?.startsWith("workspace-");
        const isFeatureBranch =
          currentBranch !== defaultBranch && !isWorkspaceBranch;

        return {
          ahead: status.ahead,
          behind: status.behind,
          hasRemote,
          currentBranch,
          isFeatureBranch,
        };
      } catch {
        return {
          ahead: 0,
          behind: 0,
          hasRemote: false,
          currentBranch: null,
          isFeatureBranch: false,
        };
      }
    },
    { signal: options?.abortSignal },
  );
}

export interface CommitInfo {
  sha: string;
  shortSha: string;
  message: string;
  author: string;
  date: string;
}

export async function getLatestCommit(
  baseDir: string,
  options?: CreateGitClientOptions,
): Promise<CommitInfo | null> {
  const manager = getGitOperationManager();
  return manager.executeRead(
    baseDir,
    async (git) => {
      try {
        const log = await git.log({ maxCount: 1 });
        const latest = log.latest;
        if (!latest) return null;

        return {
          sha: latest.hash,
          shortSha: latest.hash.slice(0, 7),
          message: latest.message,
          author: latest.author_name,
          date: latest.date,
        };
      } catch {
        return null;
      }
    },
    { signal: options?.abortSignal },
  );
}

export async function getCommitsBetweenBranches(
  baseDir: string,
  baseBranch: string,
  headBranch?: string,
  maxCount = 50,
  options?: CreateGitClientOptions,
): Promise<CommitInfo[]> {
  const manager = getGitOperationManager();
  return manager.executeRead(
    baseDir,
    async (git) => {
      try {
        const log = await git.log({
          from: `origin/${baseBranch}`,
          to: headBranch ?? "HEAD",
          maxCount,
        });
        return log.all.map((c) => ({
          sha: c.hash,
          shortSha: c.hash.slice(0, 7),
          message: c.message,
          author: c.author_name,
          date: c.date,
        }));
      } catch {
        return [];
      }
    },
    { signal: options?.abortSignal },
  );
}

export interface CommitConventions {
  conventionalCommits: boolean;
  commonPrefixes: string[];
  sampleMessages: string[];
}

export async function getCommitConventions(
  baseDir: string,
  sampleSize = 20,
  options?: CreateGitClientOptions,
): Promise<CommitConventions> {
  const manager = getGitOperationManager();
  return manager.executeRead(
    baseDir,
    async (git) => {
      try {
        const log = await git.log({ maxCount: sampleSize });
        const messages = log.all.map((c) => c.message);

        const conventionalPattern =
          /^(feat|fix|docs|style|refactor|test|chore|build|ci|perf|revert)(\(.+\))?:/;
        const conventionalCount = messages.filter((m) =>
          conventionalPattern.test(m),
        ).length;
        const conventionalCommits = conventionalCount > messages.length * 0.5;

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
    },
    { signal: options?.abortSignal },
  );
}

export async function fetch(
  baseDir: string,
  remote = "origin",
  options?: CreateGitClientOptions,
): Promise<void> {
  const manager = getGitOperationManager();
  await manager.executeWrite(
    baseDir,
    async (git) => {
      await git.fetch(remote);
    },
    { signal: options?.abortSignal },
  );
}

export async function listFiles(
  baseDir: string,
  options?: CreateGitClientOptions,
): Promise<string[]> {
  const manager = getGitOperationManager();
  return manager.executeRead(
    baseDir,
    async (git) => {
      const output = await git.raw(["ls-files"]);
      return output.split("\n").filter(Boolean);
    },
    { signal: options?.abortSignal },
  );
}

export async function listUntrackedFiles(
  baseDir: string,
  options?: CreateGitClientOptions,
): Promise<string[]> {
  const manager = getGitOperationManager();
  return manager.executeRead(
    baseDir,
    async (git) => {
      const output = await git.raw([
        "ls-files",
        "--others",
        "--exclude-standard",
      ]);
      return output.split("\n").filter(Boolean);
    },
    { signal: options?.abortSignal },
  );
}

export async function listAllFiles(
  baseDir: string,
  options?: CreateGitClientOptions,
): Promise<string[]> {
  const [tracked, untracked] = await Promise.all([
    listFiles(baseDir, options),
    listUntrackedFiles(baseDir, options),
  ]);
  return [...tracked, ...untracked];
}

export async function hasTrackedFiles(
  baseDir: string,
  options?: CreateGitClientOptions,
): Promise<boolean> {
  const files = await listFiles(baseDir, options);
  return files.length > 0;
}

export async function getStagedDiff(
  baseDir: string,
  options?: CreateGitClientOptions,
): Promise<string> {
  const manager = getGitOperationManager();
  return manager.executeRead(baseDir, (git) => git.diff(["--cached", "HEAD"]), {
    signal: options?.abortSignal,
  });
}

export async function getUnstagedDiff(
  baseDir: string,
  options?: CreateGitClientOptions,
): Promise<string> {
  const manager = getGitOperationManager();
  return manager.executeRead(baseDir, (git) => git.diff(), {
    signal: options?.abortSignal,
  });
}

export async function isCommitOnRemote(
  baseDir: string,
  commit: string,
  options?: CreateGitClientOptions,
): Promise<boolean> {
  const manager = getGitOperationManager();
  return manager.executeRead(
    baseDir,
    async (git) => {
      try {
        const output = await git.branch(["-r", "--contains", commit]);
        return output.all.length > 0;
      } catch {
        return false;
      }
    },
    { signal: options?.abortSignal },
  );
}

export async function resolveGitDir(
  baseDir: string,
  options?: CreateGitClientOptions,
): Promise<string> {
  const manager = getGitOperationManager();
  return manager.executeRead(
    baseDir,
    async (git) => {
      const gitDir = await git.revparse(["--git-dir"]);
      return path.resolve(baseDir, gitDir);
    },
    { signal: options?.abortSignal },
  );
}

export async function addToLocalExclude(
  baseDir: string,
  pattern: string,
  options?: CreateGitClientOptions,
): Promise<void> {
  const gitDir = await resolveGitDir(baseDir, options);
  const excludePath = path.join(gitDir, "info", "exclude");

  let content = "";
  try {
    content = await fs.readFile(excludePath, "utf-8");
  } catch {}

  const normalizedPattern = pattern.startsWith("/") ? pattern : `/${pattern}`;
  const patternWithoutSlash = pattern.replace(/^\//, "");
  if (
    content.includes(normalizedPattern) ||
    content.includes(patternWithoutSlash)
  ) {
    return;
  }

  const infoDir = path.join(gitDir, "info");
  await fs.mkdir(infoDir, { recursive: true });

  const newContent = content.trimEnd()
    ? `${content.trimEnd()}\n${pattern}\n`
    : `${pattern}\n`;
  await fs.writeFile(excludePath, newContent);
}
