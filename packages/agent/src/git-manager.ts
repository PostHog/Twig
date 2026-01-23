import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { Logger } from "./utils/logger.js";

const execFileAsync = promisify(execFile);

export interface GitConfig {
  repositoryPath: string;
  logger?: Logger;
}

export class GitManager {
  private repositoryPath: string;
  private logger: Logger;

  constructor(config: GitConfig) {
    this.repositoryPath = config.repositoryPath;
    this.logger =
      config.logger ?? new Logger({ debug: false, prefix: "[GitManager]" });
  }

  async runGit(args: string[]): Promise<string> {
    try {
      const { stdout } = await execFileAsync("git", args, {
        cwd: this.repositoryPath,
      });
      return stdout.trim();
    } catch (error) {
      throw new Error(`Git command failed: git ${args.join(" ")}\n${error}`);
    }
  }

  async getCurrentBranch(): Promise<string> {
    return await this.runGit(["branch", "--show-current"]);
  }

  async getDefaultBranch(): Promise<string> {
    try {
      const remoteBranch = await this.runGit([
        "symbolic-ref",
        "refs/remotes/origin/HEAD",
      ]);
      return remoteBranch.replace("refs/remotes/origin/", "");
    } catch {
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
      await this.runGit(["rev-parse", "--verify", branchName]);
      return true;
    } catch {
      return false;
    }
  }

  async createBranch(branchName: string, baseBranch?: string): Promise<void> {
    const base = baseBranch || (await this.getCurrentBranch());
    await this.runGit(["checkout", "-b", branchName, base]);
  }

  async switchToBranch(branchName: string): Promise<void> {
    await this.runGit(["checkout", branchName]);
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

  async addAllPostHogFiles(): Promise<void> {
    try {
      await this.runGit(["add", "-A", ".posthog/"]);
    } catch (error) {
      this.logger.debug("No PostHog files to add", { error });
    }
  }

  async commitChanges(
    message: string,
    options?: {
      allowEmpty?: boolean;
    },
  ): Promise<string> {
    const args = ["commit", "-m", message];
    if (options?.allowEmpty) {
      args.push("--allow-empty");
    }
    return await this.runGit(args);
  }

  async hasChanges(): Promise<boolean> {
    try {
      const status = await this.runGit(["status", "--porcelain"]);
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
      const status = await this.runGit(["diff", "--cached", "--name-only"]);
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

  private async ensureOnDefaultBranch(): Promise<string> {
    const defaultBranch = await this.getDefaultBranch();
    const currentBranch = await this.getCurrentBranch();

    if (currentBranch !== defaultBranch) {
      await this.ensureCleanWorkingDirectory("switching to default branch");
      await this.switchToBranch(defaultBranch);
    }

    return defaultBranch;
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

  async getTaskBranch(taskSlug: string): Promise<string | null> {
    try {
      const branches = await this.runGit(["branch", "--list", "--all"]);
      const branchPattern = `posthog/task-${taskSlug}`;

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
}
