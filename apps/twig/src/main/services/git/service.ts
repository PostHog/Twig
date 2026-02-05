import fs from "node:fs";
import path from "node:path";
import { isTwigBranch } from "@shared/constants";
import {
  getAllBranches,
  getChangedFilesDetailed,
  getCommitConventions,
  getCurrentBranch,
  getDefaultBranch,
  getDiffStats,
  getFileAtHead,
  getLatestCommit,
  getRemoteUrl,
  getSyncStatus,
  fetch as gitFetch,
  isGitRepository,
} from "@twig/git/queries";
import { CreateBranchSaga } from "@twig/git/sagas/branch";
import { CloneSaga } from "@twig/git/sagas/clone";
import { DiscardFileChangesSaga } from "@twig/git/sagas/discard";
import { PullSaga } from "@twig/git/sagas/pull";
import { PushSaga } from "@twig/git/sagas/push";
import { parseGitHubUrl } from "@twig/git/utils";
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

const fsPromises = fs.promises;

export const GitServiceEvent = {
  CloneProgress: "cloneProgress",
} as const;

export interface GitServiceEvents {
  [GitServiceEvent.CloneProgress]: CloneProgressPayload;
}

const FETCH_THROTTLE_MS = 5 * 60 * 1000;

@injectable()
export class GitService extends TypedEventEmitter<GitServiceEvents> {
  private lastFetchTime = new Map<string, number>();

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
  ): Promise<void> {
    const saga = new DiscardFileChangesSaga();
    const result = await saga.run({
      baseDir: directoryPath,
      filePath,
      fileStatus,
    });
    if (!result.success) throw new Error(result.error);
  }

  public async getGitSyncStatus(directoryPath: string): Promise<GitSyncStatus> {
    const now = Date.now();
    const lastFetch = this.lastFetchTime.get(directoryPath) ?? 0;
    if (now - lastFetch > FETCH_THROTTLE_MS) {
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
    return {
      success: true,
      message: `Pushed ${result.data.branch} to ${result.data.remote}`,
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
    return {
      success: true,
      message: `${result.data.changes} files changed`,
      updatedFiles: result.data.changes,
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
}
