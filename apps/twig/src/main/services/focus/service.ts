import { exec, execFile } from "node:child_process";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { promisify } from "node:util";
import { WorktreeManager } from "@posthog/agent";
import { inject, injectable } from "inversify";
import { MAIN_TOKENS } from "../../di/tokens.js";
import { logger } from "../../lib/logger";
import { getWorktreeLocation } from "../settingsStore";
import {
  type FocusRefData,
  type FocusResult,
  focusRefDataSchema,
  type StashResult,
} from "./schemas.js";
import type { FocusSyncService } from "./sync-service.js";

const execFileAsync = promisify(execFile);
const execAsync = promisify(exec);

const log = logger.scope("focus");

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export async function git(cwd: string, ...args: string[]): Promise<string> {
  const { stdout } = await execFileAsync("git", args, { cwd });
  return stdout.trim();
}

async function gitOp<T extends FocusResult>(
  operation: string,
  fn: () => Promise<T>,
): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    const message = getErrorMessage(error);
    log.error(`${operation}:`, message);
    return { success: false, error: `${operation}: ${message}` } as T;
  }
}

@injectable()
export class FocusService {
  private readonly FOCUS_REF = "refs/twig/focus";

  constructor(
    @inject(MAIN_TOKENS.FocusSyncService)
    private readonly syncService: FocusSyncService,
  ) {}

  async findWorktreeByBranch(
    mainRepoPath: string,
    branch: string,
  ): Promise<string | null> {
    const worktreesDir = path.join(mainRepoPath, ".git", "worktrees");
    const branchSuffix = branch.split("/").pop() ?? branch;

    let entries: string[];
    try {
      entries = await fs.readdir(worktreesDir);
    } catch {
      return null;
    }

    for (const name of entries) {
      if (name !== branchSuffix) continue;

      const wtDir = path.join(worktreesDir, name);
      const gitdirPath = path.join(wtDir, "gitdir");
      const headPath = path.join(wtDir, "HEAD");

      try {
        const [gitdirContent, headContent] = await Promise.all([
          fs.readFile(gitdirPath, "utf-8"),
          fs.readFile(headPath, "utf-8"),
        ]);

        const isDetached = !headContent.trim().startsWith("ref:");
        if (!isDetached) continue;

        const worktreePath = path.dirname(gitdirContent.trim());
        return worktreePath;
      } catch {}
    }

    return null;
  }

  async cleanWorkingTree(repoPath: string): Promise<void> {
    await git(repoPath, "reset");
    await git(repoPath, "restore", ".");
    await git(repoPath, "clean", "-fd");
  }

  async detachWorktree(worktreePath: string): Promise<FocusResult> {
    return gitOp("Failed to detach worktree", async () => {
      await git(worktreePath, "checkout", "--detach");
      log.info(`Detached worktree at ${worktreePath}`);
      return { success: true };
    });
  }

  async reattachWorktree(
    worktreePath: string,
    branchName: string,
  ): Promise<FocusResult> {
    return gitOp("Failed to reattach worktree", async () => {
      await git(worktreePath, "checkout", "-B", branchName);
      log.info(
        `Reattached worktree at ${worktreePath} to branch ${branchName}`,
      );
      return { success: true };
    });
  }

  async getCurrentBranch(repoPath: string): Promise<string | null> {
    const branch = await git(repoPath, "branch", "--show-current");
    if (!branch) {
      log.warn("getCurrentBranch returned empty (detached HEAD?)");
      return null;
    }
    return branch;
  }

  async isDirty(repoPath: string): Promise<boolean> {
    const stdout = await git(repoPath, "status", "--porcelain");
    return stdout.length > 0;
  }

  async stash(repoPath: string, message: string): Promise<StashResult> {
    return gitOp("Failed to stash", async () => {
      const beforeList = await git(repoPath, "stash", "list");
      const beforeCount = beforeList.split("\n").filter(Boolean).length;

      await git(repoPath, "add", "-A");
      await git(
        repoPath,
        "stash",
        "push",
        "--include-untracked",
        "-m",
        message,
      );

      const afterList = await git(repoPath, "stash", "list");
      const afterCount = afterList.split("\n").filter(Boolean).length;

      if (afterCount > beforeCount) {
        return { success: true, stashRef: "stash@{0}" };
      }
      return { success: true };
    });
  }

  async stashPop(repoPath: string): Promise<FocusResult> {
    return gitOp("Failed to pop stash", async () => {
      await git(repoPath, "stash", "pop");
      return { success: true };
    });
  }

  async checkout(repoPath: string, branch: string): Promise<FocusResult> {
    return gitOp(`Failed to checkout ${branch}`, async () => {
      await git(repoPath, "checkout", branch);
      return { success: true };
    });
  }

  async readFocusRef(repoPath: string): Promise<FocusRefData | null> {
    try {
      const stdout = await git(repoPath, "cat-file", "-p", this.FOCUS_REF);
      const parsed = JSON.parse(stdout);
      const result = focusRefDataSchema.safeParse(parsed);
      if (!result.success) {
        log.warn("Invalid focus ref data, clearing:", result.error.message);
        await this.deleteFocusRef(repoPath);
        return null;
      }
      return result.data;
    } catch (error) {
      const stderr = (error as { stderr?: string }).stderr ?? "";
      if (stderr.includes("Not a valid object name")) {
        return null;
      }
      throw error;
    }
  }

  private async isWorktreeBranch(
    repoPath: string,
    branch: string,
  ): Promise<boolean> {
    try {
      const output = await git(repoPath, "worktree", "list", "--porcelain");
      const lines = output.split("\n");
      for (const line of lines) {
        if (line.startsWith("branch refs/heads/") && line.endsWith(branch)) {
          return true;
        }
      }
      return false;
    } catch {
      return false;
    }
  }

  private async getTrunkBranch(repoPath: string): Promise<string> {
    try {
      const remote = await git(repoPath, "remote").catch(() => "origin");
      const ref = await git(
        repoPath,
        "symbolic-ref",
        `refs/remotes/${remote || "origin"}/HEAD`,
      );
      return ref.replace(`refs/remotes/${remote || "origin"}/`, "");
    } catch {
      const branches = await git(repoPath, "branch", "--list");
      if (branches.includes("main")) return "main";
      if (branches.includes("master")) return "master";
      return "main";
    }
  }

  async writeFocusRef(repoPath: string, data: FocusRefData): Promise<void> {
    let { originalBranch } = data;

    if (await this.isWorktreeBranch(repoPath, originalBranch)) {
      const trunk = await this.getTrunkBranch(repoPath);
      log.warn(
        `originalBranch "${originalBranch}" is a worktree branch, falling back to trunk "${trunk}"`,
      );
      originalBranch = trunk;
    }

    if (originalBranch === data.targetBranch) {
      throw new Error(
        `Cannot write focus ref: originalBranch === targetBranch ("${originalBranch}")`,
      );
    }

    const finalData = { ...data, originalBranch };
    const json = JSON.stringify(finalData);
    const escaped = json.replace(/'/g, "'\\''");

    const { stdout: objectId } = await execAsync(
      `echo '${escaped}' | git hash-object -w --stdin`,
      { cwd: repoPath },
    );

    await git(repoPath, "update-ref", this.FOCUS_REF, objectId.trim());
  }

  async deleteFocusRef(repoPath: string): Promise<void> {
    try {
      await git(repoPath, "update-ref", "-d", this.FOCUS_REF);
    } catch (error) {
      const stderr = (error as { stderr?: string }).stderr ?? "";
      if (stderr.includes("does not exist")) {
        log.debug("Focus ref does not exist, nothing to delete");
        return;
      }
      throw error;
    }
  }

  async getCurrentState(mainRepoPath: string): Promise<{
    refData: FocusRefData | null;
    currentBranch: string | null;
  }> {
    const [refData, currentBranch] = await Promise.all([
      this.readFocusRef(mainRepoPath),
      this.getCurrentBranch(mainRepoPath),
    ]);
    return { refData, currentBranch };
  }

  validateFocusOperation(
    currentBranch: string | null,
    targetBranch: string,
  ): string | null {
    if (!currentBranch) {
      return "Cannot focus: main repo is in detached HEAD state.";
    }
    if (currentBranch === targetBranch) {
      return `Cannot focus: already on branch "${targetBranch}".`;
    }
    return null;
  }

  async focusLocal(
    mainRepoPath: string,
    branch: string,
  ): Promise<string | null> {
    log.info(
      `Focusing local workspace for ${mainRepoPath} on branch ${branch}`,
    );

    const worktreeBasePath = getWorktreeLocation();
    const worktreeManager = new WorktreeManager({
      mainRepoPath,
      worktreeBasePath,
    });

    if (await worktreeManager.localWorktreeExists()) {
      log.info(`Local worktree already exists for ${mainRepoPath}`);
      return worktreeManager.getLocalWorktreePath();
    }

    try {
      const currentBranch = await this.getCurrentBranch(mainRepoPath);
      if (currentBranch !== branch) {
        log.warn(
          `Main repo is not on branch ${branch} (currently on ${currentBranch}), cannot background`,
        );
        return null;
      }

      const localWorktree = await worktreeManager.ensureLocalWorktree(branch);
      log.info(
        `Created local worktree at ${localWorktree.worktreePath} for branch ${branch}`,
      );

      // Copy uncommitted changes from main repo to local worktree
      await this.syncService.copyUncommittedFiles(
        mainRepoPath,
        localWorktree.worktreePath,
      );

      return localWorktree.worktreePath;
    } catch (error) {
      log.error(
        `Failed to background local workspace for ${mainRepoPath}:`,
        error,
      );
      return null;
    }
  }

  async unfocusLocal(mainRepoPath: string): Promise<boolean> {
    log.info(`Unfocusing local workspace for ${mainRepoPath}`);

    const worktreeBasePath = getWorktreeLocation();
    const worktreeManager = new WorktreeManager({
      mainRepoPath,
      worktreeBasePath,
    });

    if (!(await worktreeManager.localWorktreeExists())) {
      log.info(
        `No local worktree exists for ${mainRepoPath}, nothing to foreground`,
      );
      return true;
    }

    try {
      const localWorktreePath = worktreeManager.getLocalWorktreePath();

      // Copy uncommitted changes from local worktree back to main repo
      await this.syncService.copyUncommittedFiles(
        localWorktreePath,
        mainRepoPath,
      );

      await worktreeManager.removeLocalWorktree();
      log.info(`Removed local worktree for ${mainRepoPath}`);
      return true;
    } catch (error) {
      log.error(
        `Failed to foreground local workspace for ${mainRepoPath}:`,
        error,
      );
      return false;
    }
  }

  async isLocalFocused(mainRepoPath: string): Promise<boolean> {
    const worktreeBasePath = getWorktreeLocation();
    const worktreeManager = new WorktreeManager({
      mainRepoPath,
      worktreeBasePath,
    });
    return worktreeManager.localWorktreeExists();
  }

  getLocalWorktreePath(mainRepoPath: string): string {
    const worktreeBasePath = getWorktreeLocation();
    const worktreeManager = new WorktreeManager({
      mainRepoPath,
      worktreeBasePath,
    });
    return worktreeManager.getLocalWorktreePath();
  }
}
