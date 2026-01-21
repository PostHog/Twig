import type { FocusResult, FocusSession } from "@main/services/focus/schemas";
import { logger } from "@renderer/lib/logger";
import { queryClient } from "@renderer/lib/queryClient";
import { trpcVanilla } from "@renderer/trpc";
import { create } from "zustand";
import {
  type EnableFocusSagaInput,
  runCompleteUnfocusSaga,
  runDisableFocusSaga,
  runEnableFocusSaga,
  runRollbackFocusSaga,
} from "./sagas/focusSagas";

function invalidateBranchQueries() {
  queryClient.invalidateQueries({ queryKey: ["current-branch"] });
}

export type { FocusResult, FocusSession } from "@main/services/focus/schemas";

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

  enableFocus: (params: EnableFocusParams) => Promise<FocusResult>;
  disableFocus: () => Promise<FocusResult>;
  restore: (mainRepoPath: string) => Promise<void>;
  clearError: () => void;
}

export const useFocusStore = create<FocusState>()((set, get) => ({
  session: null,
  isEnabling: false,
  isDisabling: false,
  error: null,

  enableFocus: async (params: EnableFocusParams): Promise<FocusResult> => {
    const { mainRepoPath, worktreePath, branch } = params;
    const { session } = get();

    set({ isEnabling: true, error: null });

    try {
      // If already focused on something else, unfocus first
      if (session && session.mainRepoPath === mainRepoPath) {
        if (session.worktreePath === worktreePath) {
          set({ isEnabling: false });
          return { success: true };
        }

        log.info("Swapping focus: unfocusing current workspace first");
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
          };
        }

        set({ session: null });
      }

      const currentBranch = await trpcVanilla.git.getCurrentBranch.query({
        directoryPath: mainRepoPath,
      });

      const validationError =
        await trpcVanilla.focus.validateFocusOperation.query({
          mainRepoPath,
          currentBranch,
          targetBranch: branch,
        });

      if (validationError) {
        set({ isEnabling: false, error: validationError });
        return { success: false, error: validationError };
      }

      const sagaInput: EnableFocusSagaInput = {
        mainRepoPath,
        worktreePath,
        branch,
        originalBranch: currentBranch!,
      };

      const result = await runEnableFocusSaga(sagaInput);

      if (result.success) {
        const session: FocusSession = {
          mainRepoPath,
          worktreePath,
          branch,
          originalBranch: currentBranch!,
          mainStashRef: result.mainStashRef,
          localWorktreePath: result.localWorktreePath,
        };

        set({ session, isEnabling: false });
        invalidateBranchQueries();
        return { success: true };
      }

      set({ isEnabling: false, error: result.error ?? null });
      return { success: false, error: result.error };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      set({ isEnabling: false, error: message });
      return { success: false, error: message };
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
        invalidateBranchQueries();
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
