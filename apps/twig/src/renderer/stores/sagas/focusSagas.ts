import type { FocusResult, FocusSession } from "@main/services/focus/schemas";
import { logger } from "@renderer/lib/logger";
import { trpcVanilla } from "@renderer/trpc";

const log = logger.scope("focus-saga");

export type EnableFocusSagaInput = Omit<
  FocusSession,
  "mainStashRef" | "localWorktreePath"
>;

export type EnableFocusSagaResult = FocusResult & {
  mainStashRef: string | null;
  localWorktreePath: string | null;
};

export type DisableFocusSagaInput = FocusSession;

export type DisableFocusSagaResult = FocusResult;

interface RollbackInput {
  mainRepoPath: string;
  originalBranch: string;
  targetBranch: string;
}

interface CompleteUnfocusInput {
  mainRepoPath: string;
  originalBranch: string;
  targetBranch: string;
  mainStashRef: string | null;
}

export async function runEnableFocusSaga(
  input: EnableFocusSagaInput,
): Promise<EnableFocusSagaResult> {
  const { mainRepoPath, worktreePath, branch, originalBranch } = input;
  let mainStashRef: string | null = null;
  let localWorktreePath: string | null = null;

  try {
    // Write ref FIRST with status='focusing' for crash recovery
    await trpcVanilla.focus.writeRef.mutate({
      mainRepoPath,
      data: {
        status: "focusing",
        originalBranch,
        targetBranch: branch,
        mainStashRef: null,
        localWorktreePath: null,
      },
    });

    // Clean up any stale local worktree first
    const isLocalFocused = await trpcVanilla.focus.isLocalFocused
      .query({ mainRepoPath })
      .catch(() => false);

    if (isLocalFocused) {
      log.info("Cleaning up stale local worktree");
      await trpcVanilla.focus.unfocusLocal
        .mutate({ mainRepoPath })
        .catch((e) => log.warn("Failed to cleanup local worktree:", e));
    }

    // Background local workspace if needed
    const localTasks = await trpcVanilla.workspace.getLocalTasks.query({
      mainRepoPath,
    });

    if (localTasks.length > 0) {
      log.info(`Backgrounding local workspace (${localTasks.length} task(s))`);
      localWorktreePath = await trpcVanilla.focus.focusLocal.mutate({
        mainRepoPath,
        branch: originalBranch,
      });

      // Notify agent sessions about the directory change
      // No respawn needed - sessions have additionalDirectories configured at startup
      if (localWorktreePath) {
        for (const { taskId } of localTasks) {
          const sessions = await trpcVanilla.agent.listSessions.query({
            taskId,
          });
          for (const session of sessions) {
            trpcVanilla.agent.notifyCwdChange
              .mutate({
                sessionId: session.taskRunId,
                newPath: localWorktreePath,
                reason: "moving_to_worktree",
              })
              .catch((e) =>
                log.warn("Failed to notify session of CWD change:", e),
              );
          }
        }
      }
    }

    // Stash if dirty
    const isDirty = await trpcVanilla.focus.isDirty.query({
      repoPath: mainRepoPath,
    });

    if (isDirty) {
      log.info("Stashing uncommitted changes");
      const stashResult = await trpcVanilla.focus.stash.mutate({
        repoPath: mainRepoPath,
        message: "twig-focus: auto-stash",
      });

      if (!stashResult.success) {
        throw new Error(stashResult.error ?? "Failed to stash");
      }

      mainStashRef = stashResult.stashRef ?? null;
    }

    // Detach worktree
    log.info(`Detaching worktree at ${worktreePath}`);
    const detachResult = await trpcVanilla.focus.detachWorktree.mutate({
      worktreePath,
    });

    if (!detachResult.success) {
      throw new Error(detachResult.error ?? "Failed to detach worktree");
    }

    // Checkout branch in main repo
    log.info(`Checking out branch ${branch} in main repo`);
    const checkoutResult = await trpcVanilla.focus.checkout.mutate({
      repoPath: mainRepoPath,
      branch,
    });

    if (!checkoutResult.success) {
      throw new Error(checkoutResult.error ?? `Failed to checkout ${branch}`);
    }

    // Attach local worktree to original branch (now that main released it)
    if (localWorktreePath) {
      log.info(`Attaching local worktree to branch ${originalBranch}`);
      await trpcVanilla.focus.reattachWorktree.mutate({
        worktreePath: localWorktreePath,
        branch: originalBranch,
      });
    }

    // Start sync service
    log.info("Starting sync service");
    await trpcVanilla.focus.startSync.mutate({
      mainRepoPath,
      worktreePath,
    });

    // Update ref to status='focused'
    await trpcVanilla.focus.writeRef.mutate({
      mainRepoPath,
      data: {
        status: "focused",
        originalBranch,
        targetBranch: branch,
        mainStashRef,
        localWorktreePath,
      },
    });

    log.info("Enable focus completed");
    return { success: true, mainStashRef, localWorktreePath };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    log.error("Enable focus failed:", message);

    // Best-effort rollback
    await runRollbackFocusSaga({
      mainRepoPath,
      originalBranch,
      targetBranch: branch,
    }).catch((e) => log.error("Rollback failed:", e));

    return {
      success: false,
      error: message,
      mainStashRef: null,
      localWorktreePath: null,
    };
  }
}

export async function runDisableFocusSaga(
  input: DisableFocusSagaInput,
): Promise<DisableFocusSagaResult> {
  const { mainRepoPath, worktreePath, branch, originalBranch, mainStashRef } =
    input;

  try {
    // Write ref with status='unfocusing' for crash recovery
    await trpcVanilla.focus.writeRef.mutate({
      mainRepoPath,
      data: {
        status: "unfocusing",
        originalBranch,
        targetBranch: branch,
        mainStashRef,
        localWorktreePath: input.localWorktreePath,
      },
    });

    // Stop sync service
    log.info("Stopping sync service");
    await trpcVanilla.focus.stopSync.mutate();

    // Detach local worktree if it exists
    const isLocalFocused = await trpcVanilla.focus.isLocalFocused
      .query({ mainRepoPath })
      .catch(() => false);

    if (isLocalFocused) {
      const localPath = await trpcVanilla.focus.getLocalWorktreePath
        .query({ mainRepoPath })
        .catch(() => null);

      if (localPath) {
        log.info(`Detaching local worktree at ${localPath}`);
        await trpcVanilla.focus.detachWorktree.mutate({
          worktreePath: localPath,
        });
      }
    }

    // Checkout original branch in main
    log.info(`Checking out original branch ${originalBranch}`);
    const checkoutResult = await trpcVanilla.focus.checkout.mutate({
      repoPath: mainRepoPath,
      branch: originalBranch,
    });

    if (!checkoutResult.success) {
      throw new Error(
        checkoutResult.error ?? `Failed to checkout ${originalBranch}`,
      );
    }

    // Reattach worktree to its branch
    log.info(`Reattaching worktree to branch ${branch}`);
    const reattachResult = await trpcVanilla.focus.reattachWorktree.mutate({
      worktreePath,
      branch,
    });

    if (!reattachResult.success) {
      throw new Error(reattachResult.error ?? "Failed to reattach worktree");
    }

    // Clean main working tree
    await trpcVanilla.focus.cleanWorkingTree.mutate({
      repoPath: mainRepoPath,
    });

    // Pop stash if we had one
    let stashPopWarning: string | undefined;
    if (mainStashRef) {
      log.info("Popping stashed changes");
      const popResult = await trpcVanilla.focus.stashPop.mutate({
        repoPath: mainRepoPath,
      });

      if (!popResult.success) {
        stashPopWarning = `Stash pop failed: ${popResult.error}. Run 'git stash pop' manually.`;
        log.warn(stashPopWarning);
      }
    }

    // Foreground local workspace (remove local worktree)
    const localTasks = await trpcVanilla.workspace.getLocalTasks.query({
      mainRepoPath,
    });

    if (localTasks.length > 0) {
      log.info(`Foregrounding local workspace (${localTasks.length} task(s))`);

      // Notify agent sessions about the directory change
      // No respawn needed - sessions have additionalDirectories configured at startup
      for (const { taskId } of localTasks) {
        const sessions = await trpcVanilla.agent.listSessions.query({ taskId });
        for (const session of sessions) {
          trpcVanilla.agent.notifyCwdChange
            .mutate({
              sessionId: session.taskRunId,
              newPath: mainRepoPath,
              reason: "moving_to_local",
            })
            .catch((e) =>
              log.warn("Failed to notify session of CWD change:", e),
            );
        }
      }

      await trpcVanilla.focus.unfocusLocal
        .mutate({ mainRepoPath })
        .catch((e) => log.warn("Failed to unfocus local:", e));
    }

    // Delete ref (operation complete)
    await trpcVanilla.focus.deleteRef.mutate({ mainRepoPath });

    log.info("Disable focus completed");
    return { success: true, stashPopWarning };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    log.error("Disable focus failed:", message);
    return { success: false, error: message };
  }
}

export async function runRollbackFocusSaga(
  input: RollbackInput,
): Promise<void> {
  const { mainRepoPath, originalBranch, targetBranch } = input;

  log.info("Rolling back focus operation");

  try {
    await trpcVanilla.focus.stopSync.mutate().catch(() => {});

    const currentBranch = await trpcVanilla.git.getCurrentBranch.query({
      directoryPath: mainRepoPath,
    });

    if (currentBranch === targetBranch) {
      await trpcVanilla.focus.checkout
        .mutate({ repoPath: mainRepoPath, branch: originalBranch })
        .catch(() => {});
    }

    const worktreePath = await trpcVanilla.focus.findWorktreeByBranch
      .query({ mainRepoPath, branch: targetBranch })
      .catch(() => null);

    if (worktreePath) {
      await trpcVanilla.focus.reattachWorktree
        .mutate({ worktreePath, branch: targetBranch })
        .catch(() => {});
    }

    await trpcVanilla.focus.unfocusLocal
      .mutate({ mainRepoPath })
      .catch(() => {});

    await trpcVanilla.focus.deleteRef.mutate({ mainRepoPath });

    log.info("Rollback completed");
  } catch (error) {
    log.error("Rollback error:", error);
    await trpcVanilla.focus.deleteRef.mutate({ mainRepoPath }).catch(() => {});
  }
}

export async function runCompleteUnfocusSaga(
  input: CompleteUnfocusInput,
): Promise<void> {
  const { mainRepoPath, originalBranch, targetBranch, mainStashRef } = input;

  log.info("Completing interrupted unfocus operation");

  try {
    await trpcVanilla.focus.stopSync.mutate().catch(() => {});

    const currentBranch = await trpcVanilla.git.getCurrentBranch.query({
      directoryPath: mainRepoPath,
    });

    if (currentBranch !== originalBranch) {
      await trpcVanilla.focus.checkout
        .mutate({ repoPath: mainRepoPath, branch: originalBranch })
        .catch(() => {});
    }

    const worktreePath = await trpcVanilla.focus.findWorktreeByBranch
      .query({ mainRepoPath, branch: targetBranch })
      .catch(() => null);

    if (worktreePath) {
      await trpcVanilla.focus.reattachWorktree
        .mutate({ worktreePath, branch: targetBranch })
        .catch(() => {});
    }

    if (mainStashRef) {
      await trpcVanilla.focus.stashPop
        .mutate({ repoPath: mainRepoPath })
        .catch((e) => log.warn("Stash pop failed:", e));
    }

    await trpcVanilla.focus.unfocusLocal
      .mutate({ mainRepoPath })
      .catch(() => {});

    await trpcVanilla.focus.deleteRef.mutate({ mainRepoPath });

    log.info("Complete unfocus finished");
  } catch (error) {
    log.error("Complete unfocus error:", error);
    await trpcVanilla.focus.deleteRef.mutate({ mainRepoPath }).catch(() => {});
  }
}
