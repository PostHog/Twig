import { execFile } from "node:child_process";
import * as crypto from "node:crypto";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { promisify } from "node:util";
import { makeBranchName } from "./constants.js";
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

  constructor(config: WorktreeConfig) {
    this.mainRepoPath = config.mainRepoPath;
    this.worktreeBasePath = config.worktreeBasePath || null;
    this.repoName = path.basename(config.mainRepoPath);
    this.logger =
      config.logger ||
      new Logger({ debug: false, prefix: "[WorktreeManager]" });
  }

  private usesExternalPath(): boolean {
    return this.worktreeBasePath !== null;
  }

  private async runGitCommand(args: string[]): Promise<string> {
    try {
      const { stdout } = await execFileAsync("git", args, {
        cwd: this.mainRepoPath,
      });
      return stdout.trim();
    } catch (error) {
      throw new Error(`Git command failed: git ${args.join(" ")}\n${error}`);
    }
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

  /**
   * Ensure the local worktree exists at the deterministic path.
   * Creates it if it doesn't exist, returns existing info if it does.
   * This is used to background local tasks when focusing on a worktree.
   */
  async ensureLocalWorktree(branch: string): Promise<WorktreeInfo> {
    const localPath = this.getLocalWorktreePath();

    // Check if local worktree already exists
    try {
      await fs.access(localPath);
      // Worktree exists - get its info
      const info = await this.getWorktreeInfo(localPath);
      if (info) {
        this.logger.info("Local worktree already exists", {
          localPath,
          branch,
        });
        return info;
      }
    } catch {
      // Doesn't exist, we'll create it
    }

    this.logger.info("Creating local worktree", { localPath, branch });

    // Setup: ensure folder exists or .git/info/exclude is set
    if (!this.usesExternalPath()) {
      await this.ensureArrayDirIgnored();
    } else {
      const folderPath = this.getWorktreeFolderPath();
      await fs.mkdir(folderPath, { recursive: true });
    }

    // Get the current commit SHA - we'll create a detached worktree at this commit
    // This avoids the "branch already checked out" error when main repo is on this branch
    const commitSha = await this.runGitCommand(["rev-parse", "HEAD"]);

    // Create a detached worktree at the current commit
    // Using --detach allows the main repo to keep the branch checked out
    if (this.usesExternalPath()) {
      await this.runGitCommand([
        "worktree",
        "add",
        "--detach",
        "--quiet",
        localPath,
        commitSha.trim(),
      ]);
    } else {
      const relativePath = `./${WORKTREE_FOLDER_NAME}/local`;
      await this.runGitCommand([
        "worktree",
        "add",
        "--detach",
        "--quiet",
        relativePath,
        commitSha.trim(),
      ]);
    }

    const createdAt = new Date().toISOString();

    this.logger.info("Local worktree created successfully", {
      localPath,
      branch,
    });

    return {
      worktreePath: localPath,
      worktreeName: "local",
      branchName: branch,
      baseBranch: branch,
      createdAt,
      branchOwnership: "borrowed",
    };
  }

  /**
   * Remove the local worktree (used when bringing local back to foreground).
   */
  async removeLocalWorktree(): Promise<void> {
    const localPath = this.getLocalWorktreePath();

    try {
      await fs.access(localPath);
    } catch {
      // Doesn't exist, nothing to do
      this.logger.debug("Local worktree doesn't exist, nothing to remove");
      return;
    }

    this.logger.info("Removing local worktree", { localPath });
    await this.deleteWorktree(localPath);
  }

  /**
   * Check if the local worktree currently exists.
   */
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

    while ((await this.worktreeExists(name)) && attempts < maxAttempts) {
      name = this.generateWorktreeName();
      attempts++;
    }

    if (attempts >= maxAttempts) {
      // Fallback: append timestamp
      name = `${this.generateWorktreeName()}-${Date.now()}`;
    }

    return name;
  }

  private async getDefaultBranch(): Promise<string> {
    // Try all methods in parallel for speed
    const [symbolicRef, mainExists, masterExists] = await Promise.allSettled([
      this.runGitCommand(["symbolic-ref", "refs/remotes/origin/HEAD"]),
      this.runGitCommand(["rev-parse", "--verify", "main"]),
      this.runGitCommand(["rev-parse", "--verify", "master"]),
    ]);

    // Prefer symbolic ref (most accurate)
    if (symbolicRef.status === "fulfilled") {
      return symbolicRef.value.replace("refs/remotes/origin/", "");
    }

    // Fallback to main if it exists
    if (mainExists.status === "fulfilled") {
      return "main";
    }

    // Fallback to master if it exists
    if (masterExists.status === "fulfilled") {
      return "master";
    }

    throw new Error(
      "Cannot determine default branch. No main or master branch found.",
    );
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
      : this.getDefaultBranch();
    setupPromises.push(baseBranchPromise);

    // Wait for all setup to complete
    await Promise.all(setupPromises);
    const setupTime = Date.now() - totalStart;

    const worktreeName = await worktreeNamePromise;
    const baseBranch = await baseBranchPromise;
    const worktreePath = this.getWorktreePath(worktreeName);
    const branchName = makeBranchName(worktreeName);

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
      await this.runGitCommand([
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
      await this.runGitCommand([
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
      branchOwnership: "created",
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
      await this.runGitCommand(["rev-parse", "--verify", branch]);
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
      await this.runGitCommand([
        "worktree",
        "add",
        "--quiet",
        worktreePath,
        branch,
      ]);
    } else {
      const relativePath = `./${WORKTREE_FOLDER_NAME}/${worktreeName}`;
      await this.runGitCommand([
        "worktree",
        "add",
        "--quiet",
        relativePath,
        branch,
      ]);
    }
    const gitTime = Date.now() - gitStart;

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
      baseBranch: branch, // For borrowed branches, baseBranch is the same as branchName
      createdAt,
      branchOwnership: "borrowed",
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
        await this.runGitCommand(["worktree", "prune"]);
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
      const output = await this.runGitCommand([
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
      const output = await this.runGitCommand([
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
          branchOwnership: "created",
        });
      }
    }

    return worktrees;
  }

  async isWorktree(repoPath: string): Promise<boolean> {
    try {
      const { stdout } = await execFileAsync(
        "git",
        ["rev-parse", "--is-inside-work-tree"],
        { cwd: repoPath },
      );
      if (stdout.trim() !== "true") {
        return false;
      }

      // Check if there's a .git file (worktrees have a .git file, not a .git directory)
      const gitPath = path.join(repoPath, ".git");
      const stat = await fs.stat(gitPath);
      return stat.isFile(); // Worktrees have .git as a file, main repos have .git as a directory
    } catch {
      return false;
    }
  }

  async getMainRepoPathFromWorktree(
    worktreePath: string,
  ): Promise<string | null> {
    try {
      const gitFilePath = path.join(worktreePath, ".git");
      const content = await fs.readFile(gitFilePath, "utf-8");

      // The .git file in a worktree contains: gitdir: /path/to/main/.git/worktrees/name
      const match = content.match(/gitdir:\s*(.+)/);
      if (match) {
        const gitDir = match[1].trim();
        // Go up from .git/worktrees/name to get the main repo path
        // The gitdir points to something like: /main/repo/.git/worktrees/worktree-name
        const mainGitDir = path.resolve(gitDir, "..", "..", "..");
        return mainGitDir;
      }
      return null;
    } catch {
      return null;
    }
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
