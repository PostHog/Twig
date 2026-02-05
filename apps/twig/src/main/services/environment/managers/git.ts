import { logger } from "../../../lib/logger.js";
import type { ChangedFile, DetectRepoResult } from "../../git/schemas.js";
import type { GitService } from "../../git/service.js";
import type { GitManager } from "../types.js";

const log = logger.scope("local-git-manager");

export class LocalGitManager implements GitManager {
  constructor(private gitService: GitService) {}

  detectRepo(dirPath: string): Promise<DetectRepoResult | null> {
    return this.gitService.detectRepo(dirPath);
  }

  getChangedFiles(repoPath: string): Promise<ChangedFile[]> {
    return this.gitService.getChangedFilesHead(repoPath);
  }

  getCurrentBranch(repoPath: string): Promise<string | null> {
    return this.gitService.getCurrentBranch(repoPath);
  }

  getBranches(repoPath: string): Promise<string[]> {
    return this.gitService.getAllBranches(repoPath);
  }

  getDefaultBranch(repoPath: string): Promise<string> {
    return this.gitService.getDefaultBranch(repoPath);
  }
}

export class CloudGitManager implements GitManager {
  async detectRepo(_dirPath: string): Promise<DetectRepoResult | null> {
    log.info("CloudGitManager.detectRepo called (no-op)");
    return null;
  }

  async getChangedFiles(_repoPath: string): Promise<ChangedFile[]> {
    log.info("CloudGitManager.getChangedFiles called (no-op)");
    return [];
  }

  async getCurrentBranch(_repoPath: string): Promise<string | null> {
    log.info("CloudGitManager.getCurrentBranch called (no-op)");
    return null;
  }

  async getBranches(_repoPath: string): Promise<string[]> {
    log.info("CloudGitManager.getBranches called (no-op)");
    return [];
  }

  async getDefaultBranch(_repoPath: string): Promise<string> {
    log.info("CloudGitManager.getDefaultBranch called (no-op)");
    return "main";
  }
}
