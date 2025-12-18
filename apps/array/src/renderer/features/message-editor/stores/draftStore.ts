import type { AvailableCommand } from "@agentclientprotocol/sdk";
import { create } from "zustand";
import { persist } from "zustand/middleware";
import { immer } from "zustand/middleware/immer";
import type { EditorContent } from "../core/content";

type SessionId = string;

export interface EditorContext {
  sessionId: string;
  taskId: string | undefined;
  repoPath: string | null | undefined;
  disabled: boolean;
  isLoading: boolean;
  isCloud: boolean;
}

interface DraftState {
  drafts: Record<SessionId, EditorContent | string>;
  contexts: Record<SessionId, EditorContext>;
  commands: Record<SessionId, AvailableCommand[]>;
  _hasHydrated: boolean;
}

export interface DraftActions {
  setHasHydrated: (hydrated: boolean) => void;
  setDraft: (sessionId: SessionId, draft: EditorContent | null) => void;
  getDraft: (sessionId: SessionId) => EditorContent | string | null;
  setContext: (
    sessionId: SessionId,
    context: Partial<Omit<EditorContext, "sessionId">>,
  ) => void;
  getContext: (sessionId: SessionId) => EditorContext | null;
  removeContext: (sessionId: SessionId) => void;
  setCommands: (sessionId: SessionId, commands: AvailableCommand[]) => void;
  getCommands: (sessionId: SessionId) => AvailableCommand[];
  clearCommands: (sessionId: SessionId) => void;
}

type DraftStore = DraftState & { actions: DraftActions };

export const useDraftStore = create<DraftStore>()(
  persist(
    immer((set, get) => ({
      drafts: {},
      contexts: {},
      commands: {},
      _hasHydrated: false,

      actions: {
        setHasHydrated: (hydrated) => set({ _hasHydrated: hydrated }),

        setDraft: (sessionId, draft) =>
          set((state) => {
            if (draft === null) {
              delete state.drafts[sessionId];
            } else {
              state.drafts[sessionId] = draft;
            }
          }),

        getDraft: (sessionId) => get().drafts[sessionId] ?? null,

        setContext: (sessionId, context) =>
          set((state) => {
            const existing = state.contexts[sessionId];
            state.contexts[sessionId] = {
              sessionId,
              taskId: context.taskId ?? existing?.taskId,
              repoPath: context.repoPath ?? existing?.repoPath,
              disabled: context.disabled ?? existing?.disabled ?? false,
              isLoading: context.isLoading ?? existing?.isLoading ?? false,
              isCloud: context.isCloud ?? existing?.isCloud ?? false,
            };
          }),

        getContext: (sessionId) => get().contexts[sessionId] ?? null,

        removeContext: (sessionId) =>
          set((state) => {
            delete state.contexts[sessionId];
          }),

        setCommands: (sessionId, commands) =>
          set((state) => {
            state.commands[sessionId] = commands;
          }),

        getCommands: (sessionId) => get().commands[sessionId] ?? [],

        clearCommands: (sessionId) =>
          set((state) => {
            delete state.commands[sessionId];
          }),
      },
    })),
    {
      name: "message-editor-drafts",
      partialize: (state) => ({ drafts: state.drafts }),
      onRehydrateStorage: () => (state) => {
        state?.actions.setHasHydrated(true);
      },
    },
  ),
);
