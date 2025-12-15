import type { JSONContent } from "@tiptap/react";
import { create } from "zustand";
import { persist } from "zustand/middleware";
import { immer } from "zustand/middleware/immer";

interface MessageDraftState {
  drafts: Record<string, JSONContent>;
  _hasHydrated: boolean;
}

interface MessageDraftActions {
  setHasHydrated: (state: boolean) => void;
  setDraft: (sessionId: string, draft: JSONContent | null) => void;
}

type MessageDraftStore = MessageDraftState & { actions: MessageDraftActions };

const useStore = create<MessageDraftStore>()(
  persist(
    immer((set) => ({
      drafts: {},
      _hasHydrated: false,
      actions: {
        setHasHydrated: (state) => set({ _hasHydrated: state }),
        setDraft: (sessionId, draft) =>
          set((state) => {
            if (draft === null) {
              delete state.drafts[sessionId];
            } else {
              state.drafts[sessionId] = draft;
            }
          }),
      },
    })),
    {
      name: "message-drafts",
      partialize: (state) => ({ drafts: state.drafts }),
      onRehydrateStorage: () => (state) => {
        state?.actions.setHasHydrated(true);
      },
    },
  ),
);

export const useDraft = (sessionId: string) =>
  useStore((s) => s.drafts[sessionId] ?? null);
export const useHasHydrated = () => useStore((s) => s._hasHydrated);
export const useDraftActions = () => useStore((s) => s.actions);
