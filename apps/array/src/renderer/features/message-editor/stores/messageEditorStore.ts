import type { AvailableCommand } from "@agentclientprotocol/sdk";
import { create } from "zustand";
import { persist } from "zustand/middleware";
import { immer } from "zustand/middleware/immer";
import type { EditorContent } from "../hooks/useContenteditableEditor";
import type {
  SuggestionItem,
  SuggestionLoadingState,
  SuggestionPosition,
  SuggestionType,
} from "../types";

type SessionId = string;

interface EditorContext {
  sessionId: string;
  taskId: string | undefined;
  repoPath: string | null | undefined;
  disabled: boolean;
  isLoading: boolean;
  isCloud: boolean;
}

interface SuggestionState {
  active: boolean;
  sessionId: string | null;
  type: SuggestionType | null;
  items: SuggestionItem[];
  selectedIndex: number;
  position: SuggestionPosition | null;
  loadingState: SuggestionLoadingState;
  error: string | null;
  onSelectItem: ((item: SuggestionItem) => void) | null;
  triggerExit: (() => void) | null;
}

interface MessageEditorState {
  /** Drafts are EditorContent, but legacy persisted data may be strings */
  drafts: Record<SessionId, EditorContent | string>;
  _hasHydrated: boolean;
  contexts: Record<SessionId, EditorContext>;
  commands: Record<SessionId, AvailableCommand[]>;
  suggestion: SuggestionState;
}

interface MessageEditorActions {
  setHasHydrated: (hydrated: boolean) => void;
  setDraft: (sessionId: SessionId, draft: EditorContent | null) => void;
  setContext: (
    sessionId: SessionId,
    context: {
      taskId?: string;
      repoPath?: string | null;
      disabled?: boolean;
      isLoading?: boolean;
      isCloud?: boolean;
    },
  ) => void;
  removeContext: (sessionId: SessionId) => void;
  setCommands: (sessionId: SessionId, commands: AvailableCommand[]) => void;
  clearCommands: (sessionId: SessionId) => void;
  openSuggestion: (
    sessionId: SessionId,
    type: SuggestionType,
    position: SuggestionPosition,
  ) => void;
  closeSuggestion: () => void;
  setSuggestionItems: (items: SuggestionItem[]) => void;
  setSuggestionLoadingState: (
    state: SuggestionLoadingState,
    error?: string,
  ) => void;
  selectNext: () => void;
  selectPrevious: () => void;
  setSelectedIndex: (index: number) => void;
  updateSuggestionPosition: (position: SuggestionPosition) => void;
  setOnSelectItem: (callback: ((item: SuggestionItem) => void) | null) => void;
  setTriggerExit: (callback: (() => void) | null) => void;
}

type MessageEditorStore = MessageEditorState & {
  actions: MessageEditorActions;
};

const DEFAULT_SUGGESTION_STATE: SuggestionState = {
  active: false,
  sessionId: null,
  type: null,
  items: [],
  selectedIndex: 0,
  position: null,
  loadingState: "idle",
  error: null,
  onSelectItem: null,
  triggerExit: null,
};

const useStore = create<MessageEditorStore>()(
  persist(
    immer((set) => ({
      drafts: {},
      _hasHydrated: false,
      contexts: {},
      commands: {},
      suggestion: { ...DEFAULT_SUGGESTION_STATE },

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

        removeContext: (sessionId) =>
          set((state) => {
            delete state.contexts[sessionId];
          }),

        setCommands: (sessionId, commands) =>
          set((state) => {
            state.commands[sessionId] = commands;
          }),

        clearCommands: (sessionId) =>
          set((state) => {
            delete state.commands[sessionId];
          }),

        openSuggestion: (sessionId, type, position) =>
          set((state) => {
            state.suggestion = {
              active: true,
              sessionId,
              type,
              items: [],
              selectedIndex: 0,
              position,
              loadingState: "idle",
              error: null,
              onSelectItem: null,
              triggerExit: null,
            };
          }),

        closeSuggestion: () =>
          set((state) => {
            state.suggestion = { ...DEFAULT_SUGGESTION_STATE };
          }),

        setSuggestionItems: (items) =>
          set((state) => {
            state.suggestion.items = items;
            state.suggestion.selectedIndex = 0;
          }),

        setSuggestionLoadingState: (loadingState, error) =>
          set((state) => {
            state.suggestion.loadingState = loadingState;
            state.suggestion.error = error ?? null;
          }),

        selectNext: () =>
          set((state) => {
            if (state.suggestion.items.length === 0) return;
            state.suggestion.selectedIndex =
              (state.suggestion.selectedIndex + 1) %
              state.suggestion.items.length;
          }),

        selectPrevious: () =>
          set((state) => {
            if (state.suggestion.items.length === 0) return;
            state.suggestion.selectedIndex =
              (state.suggestion.selectedIndex -
                1 +
                state.suggestion.items.length) %
              state.suggestion.items.length;
          }),

        setSelectedIndex: (index) =>
          set((state) => {
            state.suggestion.selectedIndex = index;
          }),

        updateSuggestionPosition: (position) =>
          set((state) => {
            state.suggestion.position = position;
          }),

        setOnSelectItem: (callback) =>
          set((state) => {
            state.suggestion.onSelectItem = callback;
          }),

        setTriggerExit: (callback) =>
          set((state) => {
            state.suggestion.triggerExit = callback;
          }),
      },
    })),
    {
      name: "message-editor",
      partialize: (state) => ({ drafts: state.drafts }),
      onRehydrateStorage: () => (state) => {
        state?.actions.setHasHydrated(true);
      },
    },
  ),
);

export { useStore as useMessageEditorStore };
export type { MessageEditorActions };
