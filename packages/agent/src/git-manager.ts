import { exec } from "node:child_process";
import { promisify } from "node:util";
import { Logger } from "./utils/logger.js";

const execAsync = promisify(exec);

export interface GitConfig {
  repositoryPath: string;
  authorName?: string;
  authorEmail?: string;
  logger?: Logger;
}

export interface BranchInfo {
  name: string;
  exists: boolean;
  isCurrentBranch: boolean;
}

export class GitManager {
  private repositoryPath: string;
  private authorName?: string;
  private authorEmail?: string;
  private logger: Logger;

  constructor(config: GitConfig) {
    this.repositoryPath = config.repositoryPath;
    this.authorName = config.authorName;
    this.authorEmail = config.authorEmail;
    this.logger =
      config.logger || new Logger({ debug: false, prefix: "[GitManager]" });
  }

  private escapeShellArg(str: string): string {
    return str
      .replace(/\\/g, "\\\\")
      .replace(/"/g, '\\"')
      .replace(/`/g, "\\`")
      .replace(/\$/g, "\\$");
  }

  private async runGitCommand(command: string): Promise<string> {
    try {
      const { stdout } = await execAsync(
        `cd "${this.repositoryPath}" && git ${command}`,
      );
      return stdout.trim();
    } catch (error) {
      throw new Error(`Git command failed: ${command}\n${error}`);
    }
  }

  private async runCommand(command: string): Promise<string> {
    try {
      const { stdout } = await execAsync(
        `cd "${this.repositoryPath}" && ${command}`,
      );
      return stdout.trim();
    } catch (error) {
      throw new Error(`Command failed: ${command}\n${error}`);
    }
  }

  async isGitRepository(): Promise<boolean> {
    try {
      await this.runGitCommand("rev-parse --git-dir");
      return true;
    } catch {
      return false;
    }
  }

  async getCurrentBranch(): Promise<string> {
    return await this.runGitCommand("branch --show-current");
  }

  async getDefaultBranch(): Promise<string> {
    try {
      // Try to get the default branch from remote
      const remoteBranch = await this.runGitCommand(
        "symbolic-ref refs/remotes/origin/HEAD",
      );
      return remoteBranch.replace("refs/remotes/origin/", "");
    } catch {
      // Fallback: check if main exists, otherwise use master
      if (await this.branchExists("main")) {
        return "main";
      } else if (await this.branchExists("master")) {
        return "master";
      } else {
        throw new Error(
          "Cannot determine default branch. No main or master branch found.",
        );
      }
    }
  }

  async branchExists(branchName: string): Promise<boolean> {
    try {
      await this.runGitCommand(`rev-parse --verify ${branchName}`);
      return true;
    } catch {
      return false;
    }
  }

  async createBranch(branchName: string, baseBranch?: string): Promise<void> {
    const base = baseBranch || (await this.getCurrentBranch());
    await this.runGitCommand(`checkout -b ${branchName} ${base}`);
  }

  async switchToBranch(branchName: string): Promise<void> {
    await this.runGitCommand(`checkout ${branchName}`);
  }

  async resetToDefaultBranchIfNeeded(): Promise<boolean> {
    const currentBranch = await this.getCurrentBranch();
    const defaultBranch = await this.getDefaultBranch();

    if (currentBranch === defaultBranch) {
      this.logger.debug("Already on default branch", { branch: defaultBranch });
      return true;
    }

    if (await this.hasChanges()) {
      this.logger.warn("Skipping branch reset - uncommitted changes present", {
        currentBranch,
        defaultBranch,
      });
      return false;
    }

    await this.switchToBranch(defaultBranch);
    this.logger.info("Reset to default branch", {
      from: currentBranch,
      to: defaultBranch,
    });
    return true;
  }

  async createOrSwitchToBranch(
    branchName: string,
    baseBranch?: string,
  ): Promise<void> {
    await this.ensureCleanWorkingDirectory("switching branches");

    const exists = await this.branchExists(branchName);
    if (exists) {
      await this.switchToBranch(branchName);
    } else {
      await this.createBranch(branchName, baseBranch);
    }
  }

  async addFiles(paths: string[]): Promise<void> {
    const pathList = paths.map((p) => `"${this.escapeShellArg(p)}"`).join(" ");
    await this.runGitCommand(`add ${pathList}`);
  }

  async addAllPostHogFiles(): Promise<void> {
    try {
      // Use -A flag to add all changes (including new files) and ignore errors if directory is empty
      await this.runGitCommand("add -A .posthog/");
    } catch (error) {
      // If the directory doesn't exist or has no files, that's fine - just log and continue
      this.logger.debug("No PostHog files to add", { error });
    }
  }

  async commitChanges(
    message: string,
    options?: {
      authorName?: string;
      authorEmail?: string;
    },
  ): Promise<string> {
    const command = this.buildCommitCommand(message, options);
    return await this.runGitCommand(command);
  }

  async hasChanges(): Promise<boolean> {
    try {
      const status = await this.runGitCommand("status --porcelain");
      if (!status || status.trim().length === 0) {
        return false;
      }

      const lines = status.split("\n").filter((line) => {
        const trimmed = line.trim();
        return trimmed.length > 0 && !trimmed.includes(".posthog/");
      });

      return lines.length > 0;
    } catch {
      return false;
    }
  }

  async hasStagedChanges(): Promise<boolean> {
    try {
      const status = await this.runGitCommand("diff --cached --name-only");
      return status.length > 0;
    } catch {
      return false;
    }
  }

  // Helper: Centralized safety check for uncommitted changes
  private async ensureCleanWorkingDirectory(operation: string): Promise<void> {
    if (await this.hasChanges()) {
      throw new Error(
        `Uncommitted changes detected. Please commit or stash changes before ${operation}.`,
      );
    }
  }

  private async generateUniqueBranchName(baseName: string): Promise<string> {
    if (!(await this.branchExists(baseName))) {
      return baseName;
    }

    let counter = 1;
    let uniqueName = `${baseName}-${counter}`;
    while (await this.branchExists(uniqueName)) {
      counter++;
      uniqueName = `${baseName}-${counter}`;
    }
    return uniqueName;
  }

  private async ensureOnDefaultBranch(): Promise<string> {
    const defaultBranch = await this.getDefaultBranch();
    const currentBranch = await this.getCurrentBranch();

    if (currentBranch !== defaultBranch) {
      await this.ensureCleanWorkingDirectory("switching to default branch");
      await this.switchToBranch(defaultBranch);
    }

    return defaultBranch;
  }

  private buildCommitCommand(
    message: string,
    options?: {
      allowEmpty?: boolean;
      authorName?: string;
      authorEmail?: string;
    },
  ): string {
    let command = `commit -m "${this.escapeShellArg(message)}"`;

    if (options?.allowEmpty) {
      command += " --allow-empty";
    }

    const authorName = options?.authorName || this.authorName;
    const authorEmail = options?.authorEmail || this.authorEmail;

    if (authorName && authorEmail) {
      command += ` --author="${authorName} <${authorEmail}>"`;
    }

    return command;
  }

  async getRemoteUrl(): Promise<string | null> {
    try {
      return await this.runGitCommand("remote get-url origin");
    } catch {
      return null;
    }
  }

  async pushBranch(branchName: string, force: boolean = false): Promise<void> {
    const forceFlag = force ? "--force" : "";
    await this.runGitCommand(`push ${forceFlag} -u origin ${branchName}`);
  }

  /**
   * Tracks whether commits were made during an operation by comparing HEAD SHA
   * before and after. Returns an object with methods to finalize the operation.
   *
   * Usage:
   * const tracker = await gitManager.trackCommitsDuring();
   * // ... do work that might create commits ...
   * const result = await tracker.finalize({ commitMessage: 'fallback message', push: true });
   */
  async trackCommitsDuring(): Promise<{
    finalize: (options: {
      commitMessage: string;
      push?: boolean;
    }) => Promise<{ commitCreated: boolean; pushedBranch: boolean }>;
  }> {
    const initialSha = await this.getCommitSha("HEAD");

    return {
      finalize: async (options) => {
        const currentSha = await this.getCommitSha("HEAD");
        const externalCommitsCreated = initialSha !== currentSha;
        const hasUncommittedChanges = await this.hasChanges();

        // If no commits and no changes, nothing to do
        if (!externalCommitsCreated && !hasUncommittedChanges) {
          return { commitCreated: false, pushedBranch: false };
        }

        let commitCreated = externalCommitsCreated;

        // Commit any remaining uncommitted changes
        if (hasUncommittedChanges) {
          await this.runGitCommand("add .");
          const hasStagedChanges = await this.hasStagedChanges();

          if (hasStagedChanges) {
            await this.commitChanges(options.commitMessage);
            commitCreated = true;
          }
        }

        // Push if requested and commits were made
        let pushedBranch = false;
        if (options.push && commitCreated) {
          const currentBranch = await this.getCurrentBranch();
          await this.pushBranch(currentBranch);
          pushedBranch = true;
          this.logger.info("Pushed branch after operation", {
            branch: currentBranch,
          });
        }

        return { commitCreated, pushedBranch };
      },
    };
  }

  async createTaskBranch(taskSlug: string): Promise<string> {
    const branchName = `posthog/task-${taskSlug}`;

    // Ensure we're on default branch before creating task branch
    const defaultBranch = await this.ensureOnDefaultBranch();

    this.logger.info("Creating task branch from default branch", {
      branchName,
      taskSlug,
      baseBranch: defaultBranch,
    });

    await this.createOrSwitchToBranch(branchName, defaultBranch);

    return branchName;
  }

  async createTaskPlanningBranch(
    taskId: string,
    baseBranch?: string,
  ): Promise<string> {
    const baseName = `posthog/task-${taskId}-planning`;
    const branchName = await this.generateUniqueBranchName(baseName);

    this.logger.debug("Creating unique planning branch", {
      branchName,
      taskId,
    });

    const base = baseBranch || (await this.ensureOnDefaultBranch());
    await this.createBranch(branchName, base);

    return branchName;
  }

  async createTaskImplementationBranch(
    taskId: string,
    planningBranchName?: string,
  ): Promise<string> {
    const baseName = `posthog/task-${taskId}-implementation`;
    const branchName = await this.generateUniqueBranchName(baseName);

    this.logger.debug("Creating unique implementation branch", {
      branchName,
      taskId,
      currentBranch: await this.getCurrentBranch(),
    });

    // Determine base branch: explicit param > current planning branch > default
    let baseBranch = planningBranchName;

    if (!baseBranch) {
      const currentBranch = await this.getCurrentBranch();
      if (currentBranch.includes("-planning")) {
        baseBranch = currentBranch;
        this.logger.debug("Using current planning branch", { baseBranch });
      } else {
        baseBranch = await this.ensureOnDefaultBranch();
        this.logger.debug("Using default branch", { baseBranch });
      }
    }

    this.logger.debug("Creating implementation branch from base", {
      baseBranch,
      branchName,
    });
    await this.createBranch(branchName, baseBranch);

    this.logger.info("Implementation branch created", {
      branchName,
      currentBranch: await this.getCurrentBranch(),
    });

    return branchName;
  }

  async commitPlan(taskId: string, taskTitle: string): Promise<string> {
    const currentBranch = await this.getCurrentBranch();
    this.logger.debug("Committing plan", { taskId, currentBranch });

    await this.addAllPostHogFiles();

    const hasChanges = await this.hasStagedChanges();
    this.logger.debug("Checking for staged changes", { hasChanges });

    if (!hasChanges) {
      this.logger.info("No plan changes to commit", { taskId });
      return "No changes to commit";
    }

    const message = `📋 Add plan for task: ${taskTitle}

Task ID: ${taskId}
Generated by PostHog Agent

This commit contains the implementation plan and supporting documentation
for the task. Review the plan before proceeding with implementation.`;

    const result = await this.commitChanges(message);
    this.logger.info("Plan committed", { taskId, taskTitle });
    return result;
  }

  async commitImplementation(
    taskId: string,
    taskTitle: string,
    planSummary?: string,
  ): Promise<string> {
    await this.runGitCommand("add .");

    const hasChanges = await this.hasStagedChanges();
    if (!hasChanges) {
      this.logger.warn("No implementation changes to commit", { taskId });
      return "No changes to commit";
    }

    let message = `✨ Implement task: ${taskTitle}

Task ID: ${taskId}
Generated by PostHog Agent`;

    if (planSummary) {
      message += `\n\nPlan Summary:\n${planSummary}`;
    }

    message += `\n\nThis commit implements the changes described in the task plan.`;

    const result = await this.commitChanges(message);
    this.logger.info("Implementation committed", { taskId, taskTitle });
    return result;
  }

  async deleteBranch(
    branchName: string,
    force: boolean = false,
  ): Promise<void> {
    const forceFlag = force ? "-D" : "-d";
    await this.runGitCommand(`branch ${forceFlag} ${branchName}`);
  }

  async deleteRemoteBranch(branchName: string): Promise<void> {
    await this.runGitCommand(`push origin --delete ${branchName}`);
  }

  async getBranchInfo(branchName: string): Promise<BranchInfo> {
    const exists = await this.branchExists(branchName);
    const currentBranch = await this.getCurrentBranch();

    return {
      name: branchName,
      exists,
      isCurrentBranch: branchName === currentBranch,
    };
  }

  async getCommitSha(ref: string = "HEAD"): Promise<string> {
    return await this.runGitCommand(`rev-parse ${ref}`);
  }

  async getCommitMessage(ref: string = "HEAD"): Promise<string> {
    return await this.runGitCommand(`log -1 --pretty=%B ${ref}`);
  }

  async createPullRequest(
    branchName: string,
    title: string,
    body: string,
    baseBranch?: string,
  ): Promise<string> {
    const currentBranch = await this.getCurrentBranch();
    if (currentBranch !== branchName) {
      await this.ensureCleanWorkingDirectory("creating PR");
      await this.switchToBranch(branchName);
    }

    await this.pushBranch(branchName);

    let command = `gh pr create --title "${this.escapeShellArg(title)}" --body "${this.escapeShellArg(body)}"`;

    if (baseBranch) {
      command += ` --base ${baseBranch}`;
    }

    try {
      const prUrl = await this.runCommand(command);
      return prUrl.trim();
    } catch (error) {
      throw new Error(`Failed to create PR: ${error}`);
    }
  }

  async getTaskBranch(taskSlug: string): Promise<string | null> {
    try {
      // Get all branches matching the task slug pattern
      const branches = await this.runGitCommand("branch --list --all");
      const branchPattern = `posthog/task-${taskSlug}`;

      // Look for exact match or with counter suffix
      const lines = branches
        .split("\n")
        .map((l) => l.trim().replace(/^\*\s+/, ""));
      for (const line of lines) {
        const cleanBranch = line.replace("remotes/origin/", "");
        if (cleanBranch.startsWith(branchPattern)) {
          return cleanBranch;
        }
      }

      return null;
    } catch (error) {
      this.logger.debug("Failed to get task branch", { taskSlug, error });
      return null;
    }
  }

  async commitAndPush(
    message: string,
    options?: { allowEmpty?: boolean },
  ): Promise<void> {
    const hasChanges = await this.hasStagedChanges();

    if (!hasChanges && !options?.allowEmpty) {
      this.logger.debug("No changes to commit, skipping");
      return;
    }

    const command = this.buildCommitCommand(message, options);
    await this.runGitCommand(command);

    // Push to origin
    const currentBranch = await this.getCurrentBranch();
    await this.pushBranch(currentBranch);

    this.logger.info("Committed and pushed changes", {
      branch: currentBranch,
      message,
    });
  }

  async isWorktree(): Promise<boolean> {
    try {
      // In a worktree, .git is a file pointing to the main repo's .git/worktrees/{name}
      // In a normal repo, .git is a directory
      const result = await this.runGitCommand(
        "rev-parse --git-common-dir --git-dir",
      );
      const lines = result.split("\n");
      if (lines.length >= 2) {
        const commonDir = lines[0].trim();
        const gitDir = lines[1].trim();
        // If they're different, we're in a worktree
        return commonDir !== gitDir;
      }
      return false;
    } catch {
      return false;
    }
  }

  async getAllPullRequestComments(prNumber: number): Promise<string> {
    try {
      const output = await this.runCommand(
        `gh pr view ${prNumber} --json comments`,
      );
      return output;
    } catch (error) {
      throw new Error(`Failed to fetch PR comments: ${error}`);
    }
  }

  async getAllPullRequestReviewComments(prNumber: number): Promise<string> {
    try {
      // Extract repo from remote URL (format: owner/repo)
      const remoteUrl = await this.getRemoteUrl();
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
      const repo = repoMatch[1];

      const output = await this.runCommand(
        `gh api repos/${repo}/pulls/${prNumber}/comments`,
      );
      return output;
    } catch (error) {
      throw new Error(`Failed to fetch PR review comments: ${error}`);
    }
  }
}
