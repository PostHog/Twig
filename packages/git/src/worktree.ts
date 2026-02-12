import * as crypto from "node:crypto";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { getGitOperationManager } from "./operation-manager.js";
import {
  addToLocalExclude,
  branchExists,
  getDefaultBranch,
  listWorktrees as listWorktreesRaw,
} from "./queries.js";
import { safeSymlink } from "./utils.js";

export interface WorktreeInfo {
  worktreePath: string;
  worktreeName: string;
  branchName: string;
  baseBranch: string;
  createdAt: string;
}

export interface WorktreeConfig {
  mainRepoPath: string;
  worktreeBasePath?: string;
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

  constructor(config: WorktreeConfig) {
    this.mainRepoPath = config.mainRepoPath;
    this.worktreeBasePath = config.worktreeBasePath ?? null;
    this.repoName = path.basename(config.mainRepoPath);
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
    const excludePath = path.join(this.mainRepoPath, ".git", "info", "exclude");
    const ignorePattern = `/${WORKTREE_FOLDER_NAME}/`;

    let content = "";
    try {
      content = await fs.readFile(excludePath, "utf-8");
    } catch {}

    if (
      content.includes(`/${WORKTREE_FOLDER_NAME}/`) ||
      content.includes(`/${WORKTREE_FOLDER_NAME}`)
    ) {
      return;
    }

    const infoDir = path.join(this.mainRepoPath, ".git", "info");
    await fs.mkdir(infoDir, { recursive: true });

    const newContent = `${content.trimEnd()}\n\n# Twig worktrees\n${ignorePattern}\n`;
    await fs.writeFile(excludePath, newContent);
  }

  private async generateUniqueWorktreeName(): Promise<string> {
    let name = this.generateWorktreeName();
    let attempts = 0;
    const maxAttempts = 100;

    while (
      ((await this.worktreeExists(name)) ||
        (await branchExists(this.mainRepoPath, name))) &&
      attempts < maxAttempts
    ) {
      name = this.generateWorktreeName();
      attempts++;
    }

    if (attempts >= maxAttempts) {
      name = `${this.generateWorktreeName()}-${Date.now()}`;
    }

    return name;
  }

  async createWorktree(options?: {
    baseBranch?: string;
  }): Promise<WorktreeInfo> {
    const manager = getGitOperationManager();

    const setupPromises: Promise<unknown>[] = [];

    if (!this.usesExternalPath()) {
      setupPromises.push(this.ensureArrayDirIgnored());
    } else {
      const folderPath = this.getWorktreeFolderPath();
      setupPromises.push(fs.mkdir(folderPath, { recursive: true }));
    }

    const worktreeNamePromise = this.generateUniqueWorktreeName();
    setupPromises.push(worktreeNamePromise);

    const baseBranchPromise = options?.baseBranch
      ? Promise.resolve(options.baseBranch)
      : getDefaultBranch(this.mainRepoPath);
    setupPromises.push(baseBranchPromise);

    await Promise.all(setupPromises);

    const worktreeName = await worktreeNamePromise;
    const baseBranch = await baseBranchPromise;
    const worktreePath = this.getWorktreePath(worktreeName);
    const branchName = worktreeName;

    await manager.executeWrite(this.mainRepoPath, async (git) => {
      if (this.usesExternalPath()) {
        await git.raw([
          "worktree",
          "add",
          "--quiet",
          "-b",
          branchName,
          worktreePath,
          baseBranch,
        ]);
      } else {
        const relativePath = `./${WORKTREE_FOLDER_NAME}/${worktreeName}`;
        await git.raw([
          "worktree",
          "add",
          "--quiet",
          "-b",
          branchName,
          relativePath,
          baseBranch,
        ]);
      }
    });

    await this.symlinkClaudeConfig(worktreePath);

    return {
      worktreePath,
      worktreeName,
      branchName,
      baseBranch,
      createdAt: new Date().toISOString(),
    };
  }

  async createWorktreeForExistingBranch(branch: string): Promise<WorktreeInfo> {
    const manager = getGitOperationManager();

    const exists = await branchExists(this.mainRepoPath, branch);
    if (!exists) {
      throw new Error(`Branch '${branch}' does not exist`);
    }

    const sanitizedBranchName = branch.replace(/\//g, "-");
    let worktreeName = sanitizedBranchName;

    if (await this.worktreeExists(worktreeName)) {
      worktreeName = `${sanitizedBranchName}-${Date.now()}`;
    }

    if (!this.usesExternalPath()) {
      await this.ensureArrayDirIgnored();
    } else {
      const folderPath = this.getWorktreeFolderPath();
      await fs.mkdir(folderPath, { recursive: true });
    }

    const worktreePath = this.getWorktreePath(worktreeName);

    await manager.executeWrite(this.mainRepoPath, async (git) => {
      if (this.usesExternalPath()) {
        await git.raw(["worktree", "add", "--quiet", worktreePath, branch]);
      } else {
        const relativePath = `./${WORKTREE_FOLDER_NAME}/${worktreeName}`;
        await git.raw(["worktree", "add", "--quiet", relativePath, branch]);
      }
    });

    await this.symlinkClaudeConfig(worktreePath);

    return {
      worktreePath,
      worktreeName,
      branchName: branch,
      baseBranch: branch,
      createdAt: new Date().toISOString(),
    };
  }

  async deleteWorktree(worktreePath: string): Promise<void> {
    const manager = getGitOperationManager();
    const resolvedWorktreePath = path.resolve(worktreePath);
    const resolvedMainRepoPath = path.resolve(this.mainRepoPath);

    if (resolvedWorktreePath === resolvedMainRepoPath) {
      throw new Error("Cannot delete worktree: path matches main repo path");
    }

    if (
      resolvedMainRepoPath.startsWith(resolvedWorktreePath) &&
      resolvedMainRepoPath !== resolvedWorktreePath
    ) {
      throw new Error(
        "Cannot delete worktree: path is a parent of main repo path",
      );
    }

    try {
      const gitPath = path.join(resolvedWorktreePath, ".git");
      const stat = await fs.stat(gitPath);
      if (stat.isDirectory()) {
        throw new Error(
          "Cannot delete worktree: path appears to be a main repository (contains .git directory)",
        );
      }
    } catch (error) {
      if (
        error instanceof Error &&
        error.message.includes("Cannot delete worktree")
      ) {
        throw error;
      }
    }

    await manager.executeWrite(this.mainRepoPath, async (git) => {
      try {
        await git.raw(["worktree", "remove", worktreePath, "--force"]);
      } catch {
        await fs.rm(worktreePath, { recursive: true, force: true });
        await git.raw(["worktree", "prune"]);
      }
    });
  }

  async getWorktreeInfo(worktreePath: string): Promise<WorktreeInfo | null> {
    try {
      const worktrees = await this.listWorktrees();
      return worktrees.find((w) => w.worktreePath === worktreePath) ?? null;
    } catch {
      return null;
    }
  }

  async listWorktrees(): Promise<WorktreeInfo[]> {
    try {
      const rawWorktrees = await listWorktreesRaw(this.mainRepoPath);
      const worktreeFolderPath = this.getWorktreeFolderPath();

      return rawWorktrees
        .filter((wt) => {
          const isMainRepo =
            path.resolve(wt.path) === path.resolve(this.mainRepoPath);
          const isInWorktreeFolder = wt.path.startsWith(worktreeFolderPath);
          return wt.branch && !isMainRepo && isInWorktreeFolder;
        })
        .map((wt) => ({
          worktreePath: wt.path,
          worktreeName: path.basename(wt.path),
          branchName: wt.branch as string,
          baseBranch: "",
          createdAt: "",
        }));
    } catch {
      return [];
    }
  }

  private async symlinkClaudeConfig(worktreePath: string): Promise<void> {
    const sourceClaudeDir = path.join(this.mainRepoPath, ".claude");
    const targetClaudeDir = path.join(worktreePath, ".claude");

    const linkedDir = await safeSymlink(
      sourceClaudeDir,
      targetClaudeDir,
      "dir",
    );
    if (linkedDir) {
      await addToLocalExclude(worktreePath, ".claude");
    }

    const sourceClaudeLocalMd = path.join(this.mainRepoPath, "CLAUDE.local.md");
    const targetClaudeLocalMd = path.join(worktreePath, "CLAUDE.local.md");

    const linkedFile = await safeSymlink(
      sourceClaudeLocalMd,
      targetClaudeLocalMd,
      "file",
    );
    if (linkedFile) {
      await addToLocalExclude(worktreePath, "CLAUDE.local.md");
    }
  }

  async cleanupOrphanedWorktrees(associatedWorktreePaths: string[]): Promise<{
    deleted: string[];
    errors: Array<{ path: string; error: string }>;
  }> {
    const allWorktrees = await this.listWorktrees();
    const deleted: string[] = [];
    const errors: Array<{ path: string; error: string }> = [];

    const associatedPathsSet = new Set(
      associatedWorktreePaths.map((p) => path.resolve(p)),
    );

    for (const worktree of allWorktrees) {
      const resolvedPath = path.resolve(worktree.worktreePath);

      if (!associatedPathsSet.has(resolvedPath)) {
        try {
          await this.deleteWorktree(worktree.worktreePath);
          deleted.push(worktree.worktreePath);
        } catch (error) {
          const errorMessage =
            error instanceof Error ? error.message : String(error);
          errors.push({
            path: worktree.worktreePath,
            error: errorMessage,
          });
        }
      }
    }

    return { deleted, errors };
  }
}
