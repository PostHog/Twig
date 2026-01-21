import { Saga, type SagaLogger } from "@shared/lib/saga.js";
import type {
  DisableFocusSagaInput,
  DisableFocusSagaOutput,
  EnableFocusSagaInput,
  EnableFocusSagaOutput,
  GitOperationResult,
  StashResult,
} from "./schemas.js";
import type { FocusSyncService } from "./sync-service.js";

export interface FocusGitOperations {
  isDirty(path: string): Promise<boolean>;
  stash(path: string, message: string): Promise<StashResult>;
  stashPop(path: string): Promise<GitOperationResult>;
  checkout(path: string, branch: string): Promise<GitOperationResult>;
  detachWorktree(path: string): Promise<GitOperationResult>;
  reattachWorktree(path: string, branch: string): Promise<GitOperationResult>;
  cleanWorkingTree(path: string): Promise<void>;
}

export interface FocusSagaDeps {
  git: FocusGitOperations;
  syncService: FocusSyncService;
}

export class EnableFocusSaga extends Saga<
  EnableFocusSagaInput,
  EnableFocusSagaOutput
> {
  constructor(
    private deps: FocusSagaDeps,
    logger: SagaLogger,
  ) {
    super(logger);
  }

  protected async execute(
    input: EnableFocusSagaInput,
  ): Promise<EnableFocusSagaOutput> {
    const { mainRepoPath, worktreePath, branch, originalBranch } = input;

    const mainStashRef = await this.step({
      name: "stash_main",
      execute: async () => {
        if (await this.deps.git.isDirty(mainRepoPath)) {
          const result = await this.deps.git.stash(
            mainRepoPath,
            "twig-focus: main-auto-stash",
          );
          if (!result.success) throw new Error(result.error);
          return result.stashRef ?? null;
        }
        return null;
      },
      rollback: async (stashRef) => {
        if (stashRef) {
          await this.deps.git.stashPop(mainRepoPath);
        }
      },
    });

    await this.step({
      name: "detach_worktree",
      execute: async () => {
        const result = await this.deps.git.detachWorktree(worktreePath);
        if (!result.success) throw new Error(result.error);
      },
      rollback: async () => {
        await this.deps.git.reattachWorktree(worktreePath, branch);
      },
    });

    await this.step({
      name: "checkout_branch",
      execute: async () => {
        const result = await this.deps.git.checkout(mainRepoPath, branch);
        if (!result.success) throw new Error(result.error);
      },
      rollback: async () => {
        await this.deps.git.checkout(mainRepoPath, originalBranch);
      },
    });

    await this.step({
      name: "start_sync",
      execute: async () => {
        await this.deps.syncService.startSync(mainRepoPath, worktreePath);
      },
      rollback: async () => {
        await this.deps.syncService.stopSync();
      },
    });

    return { mainStashRef };
  }
}

export class DisableFocusSaga extends Saga<
  DisableFocusSagaInput,
  DisableFocusSagaOutput
> {
  constructor(
    private deps: FocusSagaDeps,
    logger: SagaLogger,
  ) {
    super(logger);
  }

  protected async execute(
    input: DisableFocusSagaInput,
  ): Promise<DisableFocusSagaOutput> {
    const { mainRepoPath, worktreePath, branch, originalBranch, mainStashRef } =
      input;

    await this.readOnlyStep("stop_sync", async () => {
      await this.deps.syncService.stopSync();
    });

    // Checkout original branch in main FIRST to release the focused branch,
    // then reattach worktree to the now-free branch.
    await this.readOnlyStep("checkout_original", async () => {
      const result = await this.deps.git.checkout(mainRepoPath, originalBranch);
      if (!result.success) throw new Error(result.error);
    });

    await this.readOnlyStep("reattach_worktree", async () => {
      const result = await this.deps.git.reattachWorktree(worktreePath, branch);
      if (!result.success) throw new Error(result.error);
    });

    await this.readOnlyStep("clean_main", async () => {
      await this.deps.git.cleanWorkingTree(mainRepoPath);
    });

    let stashPopWarning: string | undefined;
    if (mainStashRef) {
      await this.readOnlyStep("pop_stash", async () => {
        const result = await this.deps.git.stashPop(mainRepoPath);
        if (!result.success) {
          stashPopWarning = `Stash pop failed: ${result.error}. Run 'git stash pop' manually.`;
        }
      });
    }

    return { stashPopWarning };
  }
}
