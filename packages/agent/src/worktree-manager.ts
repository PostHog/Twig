import { execFile } from "node:child_process";
import * as crypto from "node:crypto";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { promisify } from "node:util";
import { GitManager } from "./git-manager.js";
import type { WorktreeInfo } from "./types.js";
import { Logger } from "./utils/logger.js";

const execFileAsync = promisify(execFile);

export interface WorktreeConfig {
  mainRepoPath: string;
  worktreeBasePath?: string;
  logger?: Logger;
}

const COLORS = [
  "red",
  "orange",
  "yellow",
  "green",
  "blue",
  "purple",
  "pink",
  "brown",
  "cyan",
  "magenta",
  "teal",
  "navy",
  "maroon",
  "olive",
  "coral",
  "turquoise",
  "indigo",
  "violet",
  "lavender",
  "crimson",
  "gold",
  "silver",
  "bronze",
  "ivory",
  "charcoal",
  "slate",
  "jade",
  "ruby",
  "amber",
  "emerald",
  "sapphire",
  "pearl",
  "onyx",
  "copper",
  "mint",
  "peach",
  "plum",
  "lime",
  "aqua",
  "rose",
  "sky",
  "moss",
  "sand",
  "rust",
  "burgundy",
  "cobalt",
  "ochre",
  "lilac",
  "cedar",
];

const WORKTREE_FOLDER_NAME = ".twig";

export class WorktreeManager {
  private mainRepoPath: string;
  private worktreeBasePath: string | null;
  private repoName: string;
  private logger: Logger;
  private gitManager: GitManager;

  constructor(config: WorktreeConfig) {
    this.mainRepoPath = config.mainRepoPath;
    this.worktreeBasePath = config.worktreeBasePath || null;
    this.repoName = path.basename(config.mainRepoPath);
    this.logger =
      config.logger ??
      new Logger({ debug: false, prefix: "[WorktreeManager]" });
    this.gitManager = new GitManager({
      repositoryPath: config.mainRepoPath,
      logger: this.logger,
    });
  }

  private usesExternalPath(): boolean {
    return this.worktreeBasePath !== null;
  }

  private randomElement<T>(array: T[]): T {
    return array[crypto.randomInt(array.length)];
  }

  generateWorktreeName(): string {
    const color = this.randomElement(COLORS);
    return `workspace-${color}`;
  }

  private getWorktreeFolderPath(): string {
    if (this.worktreeBasePath) {
      return path.join(this.worktreeBasePath, this.repoName);
    }
    return path.join(this.mainRepoPath, WORKTREE_FOLDER_NAME);
  }

  private getWorktreePath(name: string): string {
    return path.join(this.getWorktreeFolderPath(), name);
  }

  /**
   * Get the deterministic path for the local worktree.
   * This is used when backgrounding local tasks while focusing on a worktree.
   * Path: ~/.twig/{repoName}/local (external) or .twig/local (in-repo)
   */
  getLocalWorktreePath(): string {
    return path.join(this.getWorktreeFolderPath(), "local");
  }

  async localWorktreeExists(): Promise<boolean> {
    const localPath = this.getLocalWorktreePath();
    try {
      await fs.access(localPath);
      return true;
    } catch {
      return false;
    }
  }

  async worktreeExists(name: string): Promise<boolean> {
    const worktreePath = this.getWorktreePath(name);
    try {
      await fs.access(worktreePath);
      return true;
    } catch {
      return false;
    }
  }

  async ensureArrayDirIgnored(): Promise<void> {
    // Use .git/info/exclude instead of .gitignore to avoid modifying tracked files
    const excludePath = path.join(this.mainRepoPath, ".git", "info", "exclude");
    const ignorePattern = `/${WORKTREE_FOLDER_NAME}/`;

    let content = "";
    try {
      content = await fs.readFile(excludePath, "utf-8");
    } catch {
      // File doesn't exist or .git/info doesn't exist
    }

    // Check if pattern is already present
    if (
      content.includes(`/${WORKTREE_FOLDER_NAME}/`) ||
      content.includes(`/${WORKTREE_FOLDER_NAME}`)
    ) {
      this.logger.debug("Exclude file already contains .twig folder pattern");
      return;
    }

    // Ensure .git/info directory exists
    const infoDir = path.join(this.mainRepoPath, ".git", "info");
    await fs.mkdir(infoDir, { recursive: true });

    // Append the pattern
    const newContent = `${content.trimEnd()}\n\n# Twig worktrees\n${ignorePattern}\n`;
    await fs.writeFile(excludePath, newContent);
    this.logger.info("Added .twig folder to .git/info/exclude");
  }

  private async generateUniqueWorktreeName(): Promise<string> {
    let name = this.generateWorktreeName();
    let attempts = 0;
    const maxAttempts = 100;

    // Check both worktree directory AND branch existence to avoid collisions
    while (
      ((await this.worktreeExists(name)) ||
        (await this.gitManager.branchExists(name))) &&
      attempts < maxAttempts
    ) {
      name = this.generateWorktreeName();
      attempts++;
    }

    if (attempts >= maxAttempts) {
      // Fallback: append timestamp
      name = `${this.generateWorktreeName()}-${Date.now()}`;
    }

    return name;
  }

  async createWorktree(options?: {
    baseBranch?: string;
  }): Promise<WorktreeInfo> {
    const totalStart = Date.now();

    // Run setup tasks in parallel for speed
    const setupPromises: Promise<unknown>[] = [];

    // Only modify .git/info/exclude when using in-repo storage
    if (!this.usesExternalPath()) {
      setupPromises.push(this.ensureArrayDirIgnored());
    } else {
      // Ensure the worktree folder exists when using external path
      const folderPath = this.getWorktreeFolderPath();
      setupPromises.push(fs.mkdir(folderPath, { recursive: true }));
    }

    // Generate unique worktree name (in parallel with above)
    const worktreeNamePromise = this.generateUniqueWorktreeName();
    setupPromises.push(worktreeNamePromise);

    // Get default branch in parallel if not provided
    const baseBranchPromise = options?.baseBranch
      ? Promise.resolve(options.baseBranch)
      : this.gitManager.getDefaultBranch();
    setupPromises.push(baseBranchPromise);

    // Wait for all setup to complete
    await Promise.all(setupPromises);
    const setupTime = Date.now() - totalStart;

    const worktreeName = await worktreeNamePromise;
    const baseBranch = await baseBranchPromise;
    const worktreePath = this.getWorktreePath(worktreeName);
    const branchName = worktreeName;

    this.logger.info("Creating worktree", {
      worktreeName,
      worktreePath,
      branchName,
      baseBranch,
      external: this.usesExternalPath(),
      setupTimeMs: setupTime,
    });

    // Create the worktree with a new branch
    const gitStart = Date.now();
    if (this.usesExternalPath()) {
      // Use absolute path for external worktrees
      await this.gitManager.runGit([
        "worktree",
        "add",
        "--quiet",
        "-b",
        branchName,
        worktreePath,
        baseBranch,
      ]);
    } else {
      // Use relative path from repo root for in-repo worktrees
      const relativePath = `./${WORKTREE_FOLDER_NAME}/${worktreeName}`;
      await this.gitManager.runGit([
        "worktree",
        "add",
        "--quiet",
        "-b",
        branchName,
        relativePath,
        baseBranch,
      ]);
    }
    const gitTime = Date.now() - gitStart;

    await this.symlinkClaudeConfig(worktreePath);

    const createdAt = new Date().toISOString();

    this.logger.info("Worktree created successfully", {
      worktreeName,
      worktreePath,
      branchName,
      setupTimeMs: setupTime,
      gitWorktreeAddMs: gitTime,
      totalMs: Date.now() - totalStart,
    });

    return {
      worktreePath,
      worktreeName,
      branchName,
      baseBranch,
      createdAt,
    };
  }

  /**
   * Create a worktree for an existing branch (no new branch created).
   * This is used when the user wants to work directly on an existing branch
   * (e.g., a Graphite stack branch) instead of creating a new twig/ branch.
   *
   * IMPORTANT: The main repo must NOT have the target branch checked out,
   * as git doesn't allow the same branch in multiple worktrees.
   */
  async createWorktreeForExistingBranch(branch: string): Promise<WorktreeInfo> {
    const totalStart = Date.now();

    // Verify the branch exists
    try {
      await this.gitManager.runGit(["rev-parse", "--verify", branch]);
    } catch {
      throw new Error(`Branch '${branch}' does not exist`);
    }

    // Generate worktree name from branch (sanitize: replace / with -)
    const sanitizedBranchName = branch.replace(/\//g, "-");
    let worktreeName = sanitizedBranchName;

    // Ensure uniqueness
    if (await this.worktreeExists(worktreeName)) {
      worktreeName = `${sanitizedBranchName}-${Date.now()}`;
    }

    // Setup: ensure folder exists or .git/info/exclude is set
    if (!this.usesExternalPath()) {
      await this.ensureArrayDirIgnored();
    } else {
      const folderPath = this.getWorktreeFolderPath();
      await fs.mkdir(folderPath, { recursive: true });
    }

    const setupTime = Date.now() - totalStart;
    const worktreePath = this.getWorktreePath(worktreeName);

    this.logger.info("Creating worktree for existing branch", {
      worktreeName,
      worktreePath,
      branch,
      external: this.usesExternalPath(),
      setupTimeMs: setupTime,
    });

    // Create the worktree WITHOUT -b flag (checkout existing branch)
    const gitStart = Date.now();
    if (this.usesExternalPath()) {
      await this.gitManager.runGit([
        "worktree",
        "add",
        "--quiet",
        worktreePath,
        branch,
      ]);
    } else {
      const relativePath = `./${WORKTREE_FOLDER_NAME}/${worktreeName}`;
      await this.gitManager.runGit([
        "worktree",
        "add",
        "--quiet",
        relativePath,
        branch,
      ]);
    }
    const gitTime = Date.now() - gitStart;

    await this.symlinkClaudeConfig(worktreePath);

    const createdAt = new Date().toISOString();

    this.logger.info("Worktree for existing branch created successfully", {
      worktreeName,
      worktreePath,
      branch,
      setupTimeMs: setupTime,
      gitWorktreeAddMs: gitTime,
      totalMs: Date.now() - totalStart,
    });

    return {
      worktreePath,
      worktreeName,
      branchName: branch,
      baseBranch: branch,
      createdAt,
    };
  }

  async deleteWorktree(worktreePath: string): Promise<void> {
    const resolvedWorktreePath = path.resolve(worktreePath);
    const resolvedMainRepoPath = path.resolve(this.mainRepoPath);

    // Safety check 1: Never delete the main repo path
    if (resolvedWorktreePath === resolvedMainRepoPath) {
      const error = new Error(
        "Cannot delete worktree: path matches main repo path",
      );
      this.logger.error("Safety check failed", { worktreePath, error });
      throw error;
    }

    // Safety check 2: Never delete a parent of the main repo path
    if (
      resolvedMainRepoPath.startsWith(resolvedWorktreePath) &&
      resolvedMainRepoPath !== resolvedWorktreePath
    ) {
      const error = new Error(
        "Cannot delete worktree: path is a parent of main repo path",
      );
      this.logger.error("Safety check failed", { worktreePath, error });
      throw error;
    }

    // Safety check 3: Check for .git directory (indicates main repo)
    try {
      const gitPath = path.join(resolvedWorktreePath, ".git");
      const stat = await fs.stat(gitPath);
      if (stat.isDirectory()) {
        const error = new Error(
          "Cannot delete worktree: path appears to be a main repository (contains .git directory)",
        );
        this.logger.error("Safety check failed", { worktreePath, error });
        throw error;
      }
    } catch (error) {
      // If .git doesn't exist or we can't read it, proceed (unless it was the directory check above)
      if (
        error instanceof Error &&
        error.message.includes("Cannot delete worktree")
      ) {
        throw error;
      }
    }

    this.logger.info("Deleting worktree", { worktreePath });

    try {
      // First, try to remove the worktree via git using execFileAsync for safety
      await execFileAsync(
        "git",
        ["worktree", "remove", worktreePath, "--force"],
        {
          cwd: this.mainRepoPath,
        },
      );
      this.logger.info("Worktree deleted successfully", { worktreePath });
    } catch (error) {
      this.logger.warn(
        "Git worktree remove failed, attempting manual cleanup",
        {
          worktreePath,
          error,
        },
      );

      // Manual cleanup if git command fails
      try {
        await fs.rm(worktreePath, { recursive: true, force: true });
        // Also prune the worktree list
        await this.gitManager.runGit(["worktree", "prune"]);
        this.logger.info("Worktree cleaned up manually", { worktreePath });
      } catch (cleanupError) {
        this.logger.error("Failed to cleanup worktree", {
          worktreePath,
          cleanupError,
        });
        throw cleanupError;
      }
    }
  }

  async getWorktreeInfo(worktreePath: string): Promise<WorktreeInfo | null> {
    try {
      // Parse the worktree list to find info about this worktree
      const output = await this.gitManager.runGit([
        "worktree",
        "list",
        "--porcelain",
      ]);
      const worktrees = this.parseWorktreeList(output);

      const worktree = worktrees.find((w) => w.worktreePath === worktreePath);
      return worktree || null;
    } catch (error) {
      this.logger.debug("Failed to get worktree info", { worktreePath, error });
      return null;
    }
  }

  async listWorktrees(): Promise<WorktreeInfo[]> {
    try {
      const output = await this.gitManager.runGit([
        "worktree",
        "list",
        "--porcelain",
      ]);
      return this.parseWorktreeList(output);
    } catch (error) {
      this.logger.debug("Failed to list worktrees", { error });
      return [];
    }
  }

  private async symlinkClaudeConfig(worktreePath: string): Promise<void> {
    const sourceClaudeDir = path.join(this.mainRepoPath, ".claude");
    const targetClaudeDir = path.join(worktreePath, ".claude");

    try {
      await fs.access(sourceClaudeDir);
    } catch {
      this.logger.debug("No .claude directory in main repo to symlink");
      return;
    }

    try {
      await fs.symlink(sourceClaudeDir, targetClaudeDir, "dir");
      this.logger.info("Symlinked .claude config to worktree", {
        source: sourceClaudeDir,
        target: targetClaudeDir,
      });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "EEXIST") {
        this.logger.debug(".claude symlink already exists in worktree");
      } else {
        this.logger.warn("Failed to symlink .claude config", { error });
      }
    }
  }

  private parseWorktreeList(output: string): WorktreeInfo[] {
    const worktrees: WorktreeInfo[] = [];
    const entries = output.split("\n\n").filter((e) => e.trim());
    const worktreeFolderPath = this.getWorktreeFolderPath();

    for (const entry of entries) {
      const lines = entry.split("\n");
      let worktreePath = "";
      let branchName = "";

      for (const line of lines) {
        if (line.startsWith("worktree ")) {
          worktreePath = line.replace("worktree ", "");
        } else if (line.startsWith("branch refs/heads/")) {
          branchName = line.replace("branch refs/heads/", "");
        }
      }

      const isMainRepo =
        worktreePath &&
        path.resolve(worktreePath) === path.resolve(this.mainRepoPath);
      const isInWorktreeFolder = worktreePath?.startsWith(worktreeFolderPath);

      if (worktreePath && branchName && !isMainRepo && isInWorktreeFolder) {
        const worktreeName = path.basename(worktreePath);
        worktrees.push({
          worktreePath,
          worktreeName,
          branchName,
          baseBranch: "",
          createdAt: "",
        });
      }
    }

    return worktrees;
  }

  async cleanupOrphanedWorktrees(associatedWorktreePaths: string[]): Promise<{
    deleted: string[];
    errors: Array<{ path: string; error: string }>;
  }> {
    this.logger.info("Starting cleanup of orphaned worktrees");

    const allWorktrees = await this.listWorktrees();
    const deleted: string[] = [];
    const errors: Array<{ path: string; error: string }> = [];

    const associatedPathsSet = new Set(
      associatedWorktreePaths.map((p) => path.resolve(p)),
    );

    for (const worktree of allWorktrees) {
      const resolvedPath = path.resolve(worktree.worktreePath);

      if (!associatedPathsSet.has(resolvedPath)) {
        this.logger.info("Found orphaned worktree", {
          path: worktree.worktreePath,
        });

        try {
          await this.deleteWorktree(worktree.worktreePath);
          deleted.push(worktree.worktreePath);
          this.logger.info("Deleted orphaned worktree", {
            path: worktree.worktreePath,
          });
        } catch (error) {
          const errorMessage =
            error instanceof Error ? error.message : String(error);
          errors.push({
            path: worktree.worktreePath,
            error: errorMessage,
          });
          this.logger.error("Failed to delete orphaned worktree", {
            path: worktree.worktreePath,
            error: errorMessage,
          });
        }
      }
    }

    this.logger.info("Cleanup completed", {
      deleted: deleted.length,
      errors: errors.length,
    });

    return { deleted, errors };
  }
}
