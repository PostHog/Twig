import type { FocusResult, FocusSession } from "@main/services/focus/schemas";
import { logger } from "@renderer/lib/logger";
import { queryClient } from "@renderer/lib/queryClient";
import { trpcVanilla } from "@renderer/trpc";
import { create } from "zustand";
import type { EnableFocusSagaResult } from "./sagas/focusSagas";
import {
  type EnableFocusSagaInput,
  runCompleteUnfocusSaga,
  runDisableFocusSaga,
  runEnableFocusSaga,
  runRollbackFocusSaga,
} from "./sagas/focusSagas";

function invalidateFocusRelatedQueries() {
  queryClient.invalidateQueries({ queryKey: ["current-branch"] });
  // Delay git-related invalidations to let git operations (stash pop, file copy) settle
  setTimeout(() => {
    queryClient.invalidateQueries({ queryKey: ["diff-stats"] });
    queryClient.invalidateQueries({ queryKey: ["changed-files-head"] });
    queryClient.invalidateQueries({ queryKey: ["git-sync-status"] });
  }, 1000);
}

export type { FocusResult, FocusSession } from "@main/services/focus/schemas";
export type { EnableFocusSagaResult } from "./sagas/focusSagas";

export type EnableFocusResult = EnableFocusSagaResult & {
  wasSwap: boolean;
};

const log = logger.scope("focus-store");

interface EnableFocusParams {
  mainRepoPath: string;
  worktreePath: string;
  branch: string;
}

interface FocusState {
  session: FocusSession | null;
  isEnabling: boolean;
  isDisabling: boolean;
  error: string | null;

  enableFocus: (params: EnableFocusParams) => Promise<EnableFocusResult>;
  disableFocus: () => Promise<FocusResult>;
  restore: (mainRepoPath: string) => Promise<void>;
  clearError: () => void;
}

export const useFocusStore = create<FocusState>()((set, get) => ({
  session: null,
  isEnabling: false,
  isDisabling: false,
  error: null,

  enableFocus: async (
    params: EnableFocusParams,
  ): Promise<EnableFocusResult> => {
    const { mainRepoPath, worktreePath, branch } = params;
    const { session } = get();

    set({ isEnabling: true, error: null });

    let wasSwap = false;

    try {
      // If already focused on something else, unfocus first
      if (session && session.mainRepoPath === mainRepoPath) {
        if (session.worktreePath === worktreePath) {
          set({ isEnabling: false });
          return {
            success: true,
            mainStashRef: session.mainStashRef,
            localWorktreePath: session.localWorktreePath,
            wasSwap: false,
          };
        }

        log.info("Swapping focus: unfocusing current workspace first");
        wasSwap = true;
        const unfocusResult = await runDisableFocusSaga({
          mainRepoPath: session.mainRepoPath,
          worktreePath: session.worktreePath,
          branch: session.branch,
          originalBranch: session.originalBranch,
          mainStashRef: session.mainStashRef,
          localWorktreePath: session.localWorktreePath,
        });

        if (!unfocusResult.success) {
          set({ isEnabling: false, error: unfocusResult.error ?? null });
          return {
            success: false,
            error: `Failed to unfocus: ${unfocusResult.error}`,
            mainStashRef: null,
            localWorktreePath: null,
            wasSwap,
          };
        }

        set({ session: null });
      }

      const currentBranch = await trpcVanilla.git.getCurrentBranch.query({
        directoryPath: mainRepoPath,
      });

      if (!currentBranch) {
        set({ isEnabling: false, error: "Could not determine current branch" });
        return {
          success: false,
          error: "Could not determine current branch",
          mainStashRef: null,
          localWorktreePath: null,
          wasSwap,
        };
      }

      const validationError =
        await trpcVanilla.focus.validateFocusOperation.query({
          mainRepoPath,
          currentBranch,
          targetBranch: branch,
        });

      if (validationError) {
        set({ isEnabling: false, error: validationError });
        return {
          success: false,
          error: validationError,
          mainStashRef: null,
          localWorktreePath: null,
          wasSwap,
        };
      }

      const sagaInput: EnableFocusSagaInput = {
        mainRepoPath,
        worktreePath,
        branch,
        originalBranch: currentBranch,
      };

      const result = await runEnableFocusSaga(sagaInput);

      if (result.success) {
        const newSession: FocusSession = {
          mainRepoPath,
          worktreePath,
          branch,
          originalBranch: currentBranch,
          mainStashRef: result.mainStashRef,
          localWorktreePath: result.localWorktreePath,
        };

        set({ session: newSession, isEnabling: false });
        invalidateFocusRelatedQueries();
        return { ...result, wasSwap };
      }

      set({ isEnabling: false, error: result.error ?? null });
      return { ...result, wasSwap };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      set({ isEnabling: false, error: message });
      return {
        success: false,
        error: message,
        mainStashRef: null,
        localWorktreePath: null,
        wasSwap,
      };
    }
  },

  disableFocus: async (): Promise<FocusResult> => {
    const { session } = get();
    if (!session) {
      return { success: false, error: "No active focus session" };
    }

    set({ isDisabling: true, error: null });

    try {
      const result = await runDisableFocusSaga({
        mainRepoPath: session.mainRepoPath,
        worktreePath: session.worktreePath,
        branch: session.branch,
        originalBranch: session.originalBranch,
        mainStashRef: session.mainStashRef,
        localWorktreePath: session.localWorktreePath,
      });

      if (result.success) {
        set({ session: null, isDisabling: false });
        invalidateFocusRelatedQueries();
        return { success: true, stashPopWarning: result.stashPopWarning };
      }

      set({ isDisabling: false, error: result.error ?? null });
      return { success: false, error: result.error };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      set({ isDisabling: false, error: message });
      return { success: false, error: message };
    }
  },

  restore: async (mainRepoPath: string): Promise<void> => {
    try {
      const state = await trpcVanilla.focus.getCurrentState.query({
        mainRepoPath,
      });

      if (!state.refData) {
        return;
      }

      const {
        status,
        originalBranch,
        targetBranch,
        mainStashRef,
        localWorktreePath,
      } = state.refData;

      if (status === "focusing") {
        log.info("Found incomplete focus, rolling back");
        await runRollbackFocusSaga({
          mainRepoPath,
          originalBranch,
          targetBranch,
        });
        return;
      }

      if (status === "unfocusing") {
        log.info("Found incomplete unfocus, completing");
        await runCompleteUnfocusSaga({
          mainRepoPath,
          originalBranch,
          targetBranch,
          mainStashRef,
        });
        return;
      }

      if (originalBranch === targetBranch) {
        log.error(
          `Corrupt ref: originalBranch === targetBranch (${originalBranch})`,
        );
        await trpcVanilla.focus.deleteRef.mutate({ mainRepoPath });
        return;
      }

      if (state.currentBranch !== targetBranch) {
        log.warn(
          `Ref says focused on ${targetBranch} but main is on ${state.currentBranch}. Clearing stale ref.`,
        );
        await trpcVanilla.focus.deleteRef.mutate({ mainRepoPath });
        return;
      }

      const worktreePath = await trpcVanilla.focus.findWorktreeByBranch.query({
        mainRepoPath,
        branch: targetBranch,
      });

      if (!worktreePath) {
        log.warn(`No worktree found for branch ${targetBranch}. Clearing ref.`);
        await trpcVanilla.focus.deleteRef.mutate({ mainRepoPath });
        return;
      }

      const session: FocusSession = {
        mainRepoPath,
        worktreePath,
        branch: targetBranch,
        originalBranch,
        mainStashRef,
        localWorktreePath,
      };

      set({ session });

      await trpcVanilla.focus.startSync.mutate({
        mainRepoPath,
        worktreePath,
      });

      log.info(`Restored focus session for branch ${targetBranch}`);
    } catch (error) {
      log.error(`Failed to restore focus state for ${mainRepoPath}:`, error);
    }
  },

  clearError: () => set({ error: null }),
}));

export const selectIsFocused = (state: FocusState): boolean =>
  state.session !== null;

export const selectFocusedBranch =
  (mainRepoPath: string) =>
  (state: FocusState): string | null =>
    state.session?.mainRepoPath === mainRepoPath ? state.session.branch : null;

export const selectIsFocusedOnWorktree =
  (worktreePath: string) =>
  (state: FocusState): boolean =>
    state.session?.worktreePath === worktreePath;

export const selectIsLoading = (state: FocusState): boolean =>
  state.isEnabling || state.isDisabling;
