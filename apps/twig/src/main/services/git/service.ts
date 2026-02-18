import fs from "node:fs";
import path from "node:path";
import { isTwigBranch } from "@shared/constants";
import { execGh } from "@twig/git/gh";
import {
  getAllBranches,
  getChangedFilesDetailed,
  getCommitConventions,
  getCommitsBetweenBranches,
  getCurrentBranch,
  getDefaultBranch,
  getDiffStats,
  getFileAtHead,
  getLatestCommit,
  getRemoteUrl,
  getStagedDiff,
  getSyncStatus,
  getUnstagedDiff,
  fetch as gitFetch,
  isGitRepository,
} from "@twig/git/queries";
import { CreateBranchSaga } from "@twig/git/sagas/branch";
import { CloneSaga } from "@twig/git/sagas/clone";
import { CommitSaga } from "@twig/git/sagas/commit";
import { DiscardFileChangesSaga } from "@twig/git/sagas/discard";
import { PullSaga } from "@twig/git/sagas/pull";
import { PushSaga } from "@twig/git/sagas/push";
import { parseGitHubUrl } from "@twig/git/utils";
import { inject, injectable } from "inversify";
import { MAIN_TOKENS } from "../../di/tokens.js";
import { logger } from "../../lib/logger.js";
import { TypedEventEmitter } from "../../lib/typed-event-emitter.js";
import type { LlmCredentials } from "../llm-gateway/schemas.js";
import type { LlmGatewayService } from "../llm-gateway/service.js";
import type {
  ChangedFile,
  CloneProgressPayload,
  CommitOutput,
  CreatePrOutput,
  DetectRepoResult,
  DiffStats,
  DiscardFileChangesOutput,
  GetCommitConventionsOutput,
  GetPrTemplateOutput,
  GhStatusOutput,
  GitCommitInfo,
  GitFileStatus,
  GitRepoInfo,
  GitStateSnapshot,
  GitSyncStatus,
  OpenPrOutput,
  PrStatusOutput,
  PublishOutput,
  PullOutput,
  PushOutput,
  SyncOutput,
} from "./schemas.js";

const fsPromises = fs.promises;

export const GitServiceEvent = {
  CloneProgress: "cloneProgress",
} as const;

export interface GitServiceEvents {
  [GitServiceEvent.CloneProgress]: CloneProgressPayload;
}

const log = logger.scope("git-service");

const FETCH_THROTTLE_MS = 5 * 60 * 1000;
const MAX_DIFF_LENGTH = 8000;

@injectable()
export class GitService extends TypedEventEmitter<GitServiceEvents> {
  private lastFetchTime = new Map<string, number>();
  private llmGateway: LlmGatewayService;

  constructor(
    @inject(MAIN_TOKENS.LlmGatewayService) llmGateway: LlmGatewayService,
  ) {
    super();
    this.llmGateway = llmGateway;
  }

  private async getStateSnapshot(
    directoryPath: string,
    options?: {
      includeChangedFiles?: boolean;
      includeDiffStats?: boolean;
      includeSyncStatus?: boolean;
      includeLatestCommit?: boolean;
      includePrStatus?: boolean;
      forceRefresh?: boolean;
    },
  ): Promise<GitStateSnapshot> {
    const {
      includeChangedFiles = true,
      includeDiffStats = true,
      includeSyncStatus = true,
      includeLatestCommit = true,
      includePrStatus = false,
    } = options ?? {};

    const results = await Promise.allSettled([
      includeChangedFiles ? this.getChangedFilesHead(directoryPath) : null,
      includeDiffStats ? this.getDiffStats(directoryPath) : null,
      includeSyncStatus
        ? this.getGitSyncStatusInternal(directoryPath, true)
        : null,
      includeLatestCommit ? this.getLatestCommit(directoryPath) : null,
      includePrStatus ? this.getPrStatus(directoryPath) : null,
    ]);

    const getValue = <T>(r: PromiseSettledResult<T | null>): T | undefined =>
      r.status === "fulfilled" && r.value !== null ? r.value : undefined;

    return {
      changedFiles: getValue(results[0]),
      diffStats: getValue(results[1]),
      syncStatus: getValue(results[2]),
      latestCommit: getValue(results[3]),
      prStatus: getValue(results[4]),
    };
  }

  private async getGitSyncStatusInternal(
    directoryPath: string,
    forceRefresh = false,
  ): Promise<GitSyncStatus> {
    const now = Date.now();
    const lastFetch = this.lastFetchTime.get(directoryPath) ?? 0;
    if (forceRefresh || now - lastFetch > FETCH_THROTTLE_MS) {
      try {
        await gitFetch(directoryPath);
        this.lastFetchTime.set(directoryPath, now);
      } catch {}
    }

    const status = await getSyncStatus(directoryPath);
    return {
      ahead: status.ahead,
      behind: status.behind,
      hasRemote: status.hasRemote,
      currentBranch: status.currentBranch,
      isFeatureBranch: status.isFeatureBranch,
    };
  }

  public async detectRepo(
    directoryPath: string,
  ): Promise<DetectRepoResult | null> {
    if (!directoryPath) return null;

    const remoteUrl = await getRemoteUrl(directoryPath);
    if (!remoteUrl) return null;

    const repo = parseGitHubUrl(remoteUrl);
    if (!repo) return null;

    const branch = await getCurrentBranch(directoryPath);
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
    return isGitRepository(directoryPath);
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

    const saga = new CloneSaga();
    const result = await saga.run({
      repoUrl,
      targetPath,
      onProgress: (stage, progress, processed, total) => {
        const pct = progress ? ` ${Math.round(progress)}%` : "";
        const count = total ? ` (${processed}/${total})` : "";
        emitProgress("cloning", `${stage}${pct}${count}`);
      },
    });
    if (!result.success) {
      emitProgress("error", result.error);
      throw new Error(result.error);
    }
    emitProgress("complete", "Clone completed successfully");
    return { cloneId };
  }

  public async getRemoteUrl(directoryPath: string): Promise<string | null> {
    return getRemoteUrl(directoryPath);
  }

  public async getCurrentBranch(directoryPath: string): Promise<string | null> {
    return getCurrentBranch(directoryPath);
  }

  public async getDefaultBranch(directoryPath: string): Promise<string> {
    return getDefaultBranch(directoryPath);
  }

  public async getAllBranches(directoryPath: string): Promise<string[]> {
    const branches = await getAllBranches(directoryPath);
    return branches.filter((branch) => !isTwigBranch(branch));
  }

  public async createBranch(
    directoryPath: string,
    branchName: string,
  ): Promise<void> {
    const saga = new CreateBranchSaga();
    const result = await saga.run({ baseDir: directoryPath, branchName });
    if (!result.success) throw new Error(result.error);
  }

  public async getChangedFilesHead(
    directoryPath: string,
  ): Promise<ChangedFile[]> {
    const files = await getChangedFilesDetailed(directoryPath, {
      excludePatterns: [".claude", "CLAUDE.local.md"],
    });
    return files.map((f) => ({
      path: f.path,
      status: f.status,
      originalPath: f.originalPath,
      linesAdded: f.linesAdded,
      linesRemoved: f.linesRemoved,
    }));
  }

  public async getFileAtHead(
    directoryPath: string,
    filePath: string,
  ): Promise<string | null> {
    return getFileAtHead(directoryPath, filePath);
  }

  public async getDiffStats(directoryPath: string): Promise<DiffStats> {
    const stats = await getDiffStats(directoryPath, {
      excludePatterns: [".claude", "CLAUDE.local.md"],
    });
    return {
      filesChanged: stats.filesChanged,
      linesAdded: stats.linesAdded,
      linesRemoved: stats.linesRemoved,
    };
  }

  public async discardFileChanges(
    directoryPath: string,
    filePath: string,
    fileStatus: GitFileStatus,
  ): Promise<DiscardFileChangesOutput> {
    const saga = new DiscardFileChangesSaga();
    const result = await saga.run({
      baseDir: directoryPath,
      filePath,
      fileStatus,
    });
    if (!result.success) {
      return { success: false };
    }

    const state = await this.getStateSnapshot(directoryPath, {
      includeSyncStatus: false,
      includeLatestCommit: false,
    });

    return { success: true, state };
  }

  public async getGitSyncStatus(
    directoryPath: string,
    forceRefresh = false,
  ): Promise<GitSyncStatus> {
    return this.getGitSyncStatusInternal(directoryPath, forceRefresh);
  }

  public async getLatestCommit(
    directoryPath: string,
  ): Promise<GitCommitInfo | null> {
    const commit = await getLatestCommit(directoryPath);
    if (!commit) return null;
    return {
      sha: commit.sha,
      shortSha: commit.shortSha,
      message: commit.message,
      author: commit.author,
      date: commit.date,
    };
  }

  public async getGitRepoInfo(
    directoryPath: string,
  ): Promise<GitRepoInfo | null> {
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
  }

  public async push(
    directoryPath: string,
    remote = "origin",
    branch?: string,
    setUpstream = false,
  ): Promise<PushOutput> {
    const saga = new PushSaga();
    const result = await saga.run({
      baseDir: directoryPath,
      remote,
      branch: branch || undefined,
      setUpstream,
    });
    if (!result.success) {
      return { success: false, message: result.error };
    }

    const state = await this.getStateSnapshot(directoryPath, {
      includeChangedFiles: false,
      includeDiffStats: false,
      includeLatestCommit: false,
    });

    return {
      success: true,
      message: `Pushed ${result.data.branch} to ${result.data.remote}`,
      state,
    };
  }

  public async pull(
    directoryPath: string,
    remote = "origin",
    branch?: string,
  ): Promise<PullOutput> {
    const saga = new PullSaga();
    const result = await saga.run({
      baseDir: directoryPath,
      remote,
      branch: branch || undefined,
    });
    if (!result.success) {
      return { success: false, message: result.error };
    }

    const state = await this.getStateSnapshot(directoryPath);

    return {
      success: true,
      message: `${result.data.changes} files changed`,
      updatedFiles: result.data.changes,
      state,
    };
  }

  public async publish(
    directoryPath: string,
    remote = "origin",
  ): Promise<PublishOutput> {
    const currentBranch = await getCurrentBranch(directoryPath);
    if (!currentBranch) {
      return { success: false, message: "No branch to publish", branch: "" };
    }

    const pushResult = await this.push(
      directoryPath,
      remote,
      currentBranch,
      true,
    );
    return {
      success: pushResult.success,
      message: pushResult.message,
      branch: currentBranch,
      state: pushResult.state,
    };
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

    const state = await this.getStateSnapshot(directoryPath);

    return {
      success: pushResult.success,
      pullMessage: pullResult.message,
      pushMessage: pushResult.message,
      state,
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
      } catch {}
    }

    return { template: null, templatePath: null };
  }

  public async getCommitConventions(
    directoryPath: string,
    sampleSize = 20,
  ): Promise<GetCommitConventionsOutput> {
    return getCommitConventions(directoryPath, sampleSize);
  }

  public async commit(
    directoryPath: string,
    message: string,
    paths?: string[],
    allowEmpty?: boolean,
  ): Promise<CommitOutput> {
    const fail = (msg: string): CommitOutput => ({
      success: false,
      message: msg,
      commitSha: null,
      branch: null,
    });

    if (!message.trim()) return fail("Commit message is required");

    const saga = new CommitSaga();
    const result = await saga.run({
      baseDir: directoryPath,
      message: message.trim(),
      paths,
      allowEmpty,
    });

    if (!result.success) return fail(result.error);

    const state = await this.getStateSnapshot(directoryPath);

    return {
      success: true,
      message: `Committed ${result.data.commitSha.slice(0, 7)}`,
      commitSha: result.data.commitSha,
      branch: result.data.branch,
      state,
    };
  }

  public async getGhStatus(): Promise<GhStatusOutput> {
    const versionResult = await execGh(["--version"]);
    if (versionResult.exitCode !== 0) {
      return {
        installed: false,
        version: null,
        authenticated: false,
        username: null,
        error: versionResult.error ?? versionResult.stderr ?? null,
      };
    }

    const version = versionResult.stdout.split("\n")[0]?.trim() ?? null;
    const authResult = await execGh(["auth", "status"]);
    const authenticated = authResult.exitCode === 0;
    const authOutput = `${authResult.stdout}\n${authResult.stderr}`;
    const usernameMatch = authOutput.match(/Logged in to github.com as (\S+)/);

    return {
      installed: true,
      version,
      authenticated,
      username: usernameMatch?.[1] ?? null,
      error: authenticated
        ? null
        : authResult.stderr || authResult.error || null,
    };
  }

  public async getPrStatus(directoryPath: string): Promise<PrStatusOutput> {
    const base: PrStatusOutput = {
      hasRemote: false,
      isGitHubRepo: false,
      currentBranch: null,
      defaultBranch: null,
      prExists: false,
      prUrl: null,
      prState: null,
      baseBranch: null,
      headBranch: null,
      isDraft: null,
      error: null,
    };

    try {
      const remoteUrl = await getRemoteUrl(directoryPath);
      const isGitHubRepo = !!(remoteUrl && parseGitHubUrl(remoteUrl));
      const currentBranch = await getCurrentBranch(directoryPath);
      const defaultBranch = await getDefaultBranch(directoryPath).catch(
        () => null,
      );

      if (!isGitHubRepo || !currentBranch) {
        return {
          ...base,
          hasRemote: !!remoteUrl,
          isGitHubRepo,
          currentBranch,
          defaultBranch,
        };
      }

      const prResult = await execGh(
        ["pr", "view", "--json", "url,state,baseRefName,headRefName,isDraft"],
        { cwd: directoryPath },
      );

      const shared = {
        hasRemote: true,
        isGitHubRepo: true,
        currentBranch,
        defaultBranch,
      };

      if (prResult.exitCode !== 0) {
        return { ...base, ...shared };
      }

      const data = JSON.parse(prResult.stdout) as {
        url?: string;
        state?: string;
        baseRefName?: string;
        headRefName?: string;
        isDraft?: boolean;
      };

      return {
        ...base,
        ...shared,
        prExists: !!data.url,
        prUrl: data.url ?? null,
        prState: data.state ?? null,
        baseBranch: data.baseRefName ?? null,
        headBranch: data.headRefName ?? null,
        isDraft: data.isDraft ?? null,
      };
    } catch (error) {
      return {
        ...base,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  public async createPr(
    directoryPath: string,
    title?: string,
    body?: string,
    draft?: boolean,
  ): Promise<CreatePrOutput> {
    const args = ["pr", "create"];
    if (title) args.push("--title", title);
    if (body) args.push("--body", body);
    if (draft) args.push("--draft");

    const result = await execGh(args, { cwd: directoryPath });
    if (result.exitCode !== 0) {
      return {
        success: false,
        message: result.stderr || result.error || "Failed to create PR",
        prUrl: null,
      };
    }

    const prUrlMatch = result.stdout.match(/https:\/\/github\.com\/[^\s]+/);
    const prUrl = prUrlMatch?.[0] ?? null;

    const state = await this.getStateSnapshot(directoryPath, {
      includeChangedFiles: false,
      includeDiffStats: false,
      includeLatestCommit: false,
      includePrStatus: true,
    });

    return {
      success: true,
      message: "Pull request created",
      prUrl,
      state,
    };
  }

  public async openPr(directoryPath: string): Promise<OpenPrOutput> {
    const result = await execGh(["pr", "view", "--json", "url"], {
      cwd: directoryPath,
    });

    if (result.exitCode !== 0) {
      return {
        success: false,
        message: result.stderr || result.error || "Failed to fetch PR",
        prUrl: null,
      };
    }

    const data = JSON.parse(result.stdout) as { url?: string };
    const prUrl = data.url ?? null;
    return { success: !!prUrl, message: prUrl ? "OK" : "No PR found", prUrl };
  }

  public async getPrChangedFiles(prUrl: string): Promise<ChangedFile[]> {
    const match = prUrl.match(/github\.com\/([^/]+)\/([^/]+)\/pull\/(\d+)/);
    if (!match) return [];

    const [, owner, repo, number] = match;

    try {
      const result = await execGh([
        "api",
        `repos/${owner}/${repo}/pulls/${number}/files`,
        "--paginate",
        "--slurp",
      ]);

      if (result.exitCode !== 0) {
        throw new Error(
          `Failed to fetch PR files: ${result.stderr || result.error || "Unknown error"}`,
        );
      }

      const pages = JSON.parse(result.stdout) as Array<
        Array<{
          filename: string;
          status: string;
          previous_filename?: string;
          additions: number;
          deletions: number;
        }>
      >;
      const files = pages.flat();

      return files.map((f) => {
        let status: ChangedFile["status"];
        switch (f.status) {
          case "added":
            status = "added";
            break;
          case "removed":
            status = "deleted";
            break;
          case "renamed":
            status = "renamed";
            break;
          default:
            status = "modified";
            break;
        }

        return {
          path: f.filename,
          status,
          originalPath: f.previous_filename,
          linesAdded: f.additions,
          linesRemoved: f.deletions,
        };
      });
    } catch (error) {
      log.warn("Failed to fetch PR changed files", { prUrl, error });
      throw error;
    }
  }

  public async getBranchChangedFiles(
    repo: string,
    branch: string,
  ): Promise<ChangedFile[]> {
    const parts = repo.split("/");
    if (parts.length !== 2) return [];

    const [owner, repoName] = parts;

    try {
      const repoResult = await execGh([
        "api",
        `repos/${owner}/${repoName}`,
        "--jq",
        ".default_branch",
      ]);

      const defaultBranch =
        repoResult.exitCode === 0 && repoResult.stdout.trim()
          ? repoResult.stdout.trim()
          : "main";

      const result = await execGh([
        "api",
        `repos/${owner}/${repoName}/compare/${defaultBranch}...${branch}`,
        "--jq",
        ".files",
      ]);

      if (result.exitCode !== 0) {
        throw new Error(
          `Failed to fetch branch files: ${result.stderr || result.error || "Unknown error"}`,
        );
      }

      const files = JSON.parse(result.stdout) as Array<{
        filename: string;
        status: string;
        previous_filename?: string;
        additions: number;
        deletions: number;
      }> | null;

      if (!files) return [];

      return files.map((f) => {
        let status: ChangedFile["status"];
        switch (f.status) {
          case "added":
            status = "added";
            break;
          case "removed":
            status = "deleted";
            break;
          case "renamed":
            status = "renamed";
            break;
          default:
            status = "modified";
            break;
        }

        return {
          path: f.filename,
          status,
          originalPath: f.previous_filename,
          linesAdded: f.additions,
          linesRemoved: f.deletions,
        };
      });
    } catch (error) {
      log.warn("Failed to fetch branch changed files", {
        repo,
        branch,
        error,
      });
      throw error;
    }
  }

  public async generateCommitMessage(
    directoryPath: string,
    credentials: LlmCredentials,
  ): Promise<{ message: string }> {
    const [stagedDiff, unstagedDiff, conventions, changedFiles] =
      await Promise.all([
        getStagedDiff(directoryPath),
        getUnstagedDiff(directoryPath),
        getCommitConventions(directoryPath),
        this.getChangedFilesHead(directoryPath),
      ]);

    const diff = stagedDiff || unstagedDiff;
    if (!diff && changedFiles.length === 0) {
      return { message: "" };
    }

    const truncatedDiff =
      diff.length > MAX_DIFF_LENGTH
        ? `${diff.slice(0, MAX_DIFF_LENGTH)}\n... (diff truncated)`
        : diff;

    const filesSummary = changedFiles
      .map((f) => `${f.status}: ${f.path}`)
      .join("\n");

    const conventionHint = conventions.conventionalCommits
      ? `This repository uses conventional commits. Common prefixes: ${
          conventions.commonPrefixes.join(", ") || "feat, fix, docs, chore"
        }.
Example messages from this repo:
${conventions.sampleMessages.slice(0, 3).join("\n")}`
      : `Example messages from this repo:
${conventions.sampleMessages.slice(0, 3).join("\n")}`;

    const system = `You are a git commit message generator. Generate a concise, descriptive commit message for the given changes.

${conventionHint}

Rules:
- First line should be a short summary (max 72 chars)
- Use imperative mood ("Add feature" not "Added feature")
- Be specific about what changed
- If using conventional commits, include the appropriate prefix
- Do not include any explanation, just output the commit message`;

    const userMessage = `Generate a commit message for these changes:

Changed files:
${filesSummary}

Diff:
${truncatedDiff}`;

    log.debug("Generating commit message", {
      fileCount: changedFiles.length,
      diffLength: diff.length,
      conventionalCommits: conventions.conventionalCommits,
    });

    const response = await this.llmGateway.prompt(
      credentials,
      [{ role: "user", content: userMessage }],
      { system },
    );

    return { message: response.content.trim() };
  }

  public async generatePrTitleAndBody(
    directoryPath: string,
    credentials: LlmCredentials,
  ): Promise<{ title: string; body: string }> {
    const [defaultBranch, currentBranch, changedFiles, prTemplate] =
      await Promise.all([
        getDefaultBranch(directoryPath),
        getCurrentBranch(directoryPath),
        this.getChangedFilesHead(directoryPath),
        this.getPrTemplate(directoryPath),
      ]);

    const commits = await getCommitsBetweenBranches(
      directoryPath,
      defaultBranch,
      currentBranch ?? undefined,
      30,
    );

    if (commits.length === 0 && changedFiles.length === 0) {
      return { title: "", body: "" };
    }

    const commitsSummary = commits.map((c) => `- ${c.message}`).join("\n");

    const filesSummary = changedFiles
      .map((f) => `${f.status}: ${f.path}`)
      .join("\n");

    const templateHint = prTemplate.template
      ? `The repository has a PR template. Use it as a guide for structure but adapt the content to match the actual changes:\n${prTemplate.template.slice(
          0,
          2000,
        )}`
      : "";

    const system = `You are a PR description generator. Generate a title and detailed description for a pull request.

Output format (use exactly this format):
TITLE: <short descriptive title, max 72 chars>

BODY:
<detailed description>

Rules for the title:
- Short and descriptive (max 72 chars)
- Use imperative mood ("Add feature" not "Added feature")
- Be specific about what the PR accomplishes

Rules for the body:
- Start with a TL;DR section (1-2 sentences summarizing the change)
- Include a "What changed?" section with bullet points describing the key changes
- Be thorough but concise
- Use markdown formatting
${templateHint}

Do not include any explanation outside the TITLE and BODY sections.`;

    const userMessage = `Generate a PR title and description for these changes:

Branch: ${currentBranch ?? "unknown"} -> ${defaultBranch}

Commits in this PR:
${commitsSummary || "(no commits yet - changes are uncommitted)"}

Changed files:
${filesSummary || "(no file changes detected)"}`;

    log.debug("Generating PR title and body", {
      commitCount: commits.length,
      fileCount: changedFiles.length,
      hasTemplate: !!prTemplate.template,
    });

    const response = await this.llmGateway.prompt(
      credentials,
      [{ role: "user", content: userMessage }],
      { system, maxTokens: 2000 },
    );

    const content = response.content.trim();
    const titleMatch = content.match(/^TITLE:\s*(.+?)(?:\n|$)/m);
    const bodyMatch = content.match(/BODY:\s*([\s\S]+)$/m);

    return {
      title: titleMatch?.[1]?.trim() ?? "",
      body: bodyMatch?.[1]?.trim() ?? "",
    };
  }
}
