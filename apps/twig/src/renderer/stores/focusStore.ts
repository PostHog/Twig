import type { FocusResult, FocusSession } from "@main/services/focus/schemas";
import { queryClient } from "@renderer/lib/queryClient";
import { create } from "zustand";
import {
  type FocusSagaResult,
  runDisableFocusSaga,
  runFocusSaga,
  runRestoreSaga,
} from "./sagas/focusSagas";

export type { FocusResult, FocusSession } from "@main/services/focus/schemas";
export type { FocusSagaResult } from "./sagas/focusSagas";

interface EnableFocusParams {
  mainRepoPath: string;
  worktreePath: string;
  branch: string;
}

interface FocusState {
  session: FocusSession | null;
  isLoading: boolean;
  enableFocus: (params: EnableFocusParams) => Promise<FocusSagaResult>;
  disableFocus: () => Promise<FocusResult>;
  restore: (mainRepoPath: string) => Promise<void>;
  updateSessionBranch: (worktreePath: string, newBranch: string) => void;
}

function invalidateQueries() {
  queryClient.invalidateQueries({ queryKey: ["current-branch"] });
  setTimeout(() => {
    queryClient.invalidateQueries({ queryKey: ["diff-stats"] });
    queryClient.invalidateQueries({ queryKey: ["changed-files-head"] });
    queryClient.invalidateQueries({ queryKey: ["git-sync-status"] });
  }, 1000);
}

export const useFocusStore = create<FocusState>()((set, get) => ({
  session: null,
  isLoading: false,

  enableFocus: async (params) => {
    set({ isLoading: true });
    const result = await runFocusSaga({
      ...params,
      currentSession: get().session,
    });
    set({
      isLoading: false,
      session: result.success ? result.session : get().session,
    });
    if (result.success) invalidateQueries();
    return result;
  },

  disableFocus: async () => {
    const { session } = get();
    if (!session) return { success: false, error: "No active focus session" };

    set({ isLoading: true });
    const result = await runDisableFocusSaga(session);
    set({ isLoading: false, session: result.success ? null : session });
    if (result.success) invalidateQueries();
    return result;
  },

  restore: async (mainRepoPath) => {
    const session = await runRestoreSaga(mainRepoPath);
    if (session) set({ session });
  },

  updateSessionBranch: (worktreePath, newBranch) => {
    const { session } = get();
    if (session?.worktreePath === worktreePath) {
      set({ session: { ...session, branch: newBranch } });
    }
  },
}));

export const selectIsLoading = (state: FocusState) => state.isLoading;

export const selectIsFocusedOnWorktree =
  (worktreePath: string) => (state: FocusState) =>
    state.session?.worktreePath === worktreePath;
