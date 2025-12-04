import type { JSONContent } from "@tiptap/react";
import { create } from "zustand";
import { persist } from "zustand/middleware";

interface MessageDraftStore {
  drafts: Record<string, JSONContent>;
  _hasHydrated: boolean;
  setHasHydrated: (state: boolean) => void;
  getDraft: (sessionId: string) => JSONContent | null;
  setDraft: (sessionId: string, draft: JSONContent | null) => void;
  clearDraft: (sessionId: string) => void;
}

export const useMessageDraftStore = create<MessageDraftStore>()(
  persist(
    (set, get) => ({
      drafts: {},
      _hasHydrated: false,
      setHasHydrated: (state) => set({ _hasHydrated: state }),
      getDraft: (sessionId) => get().drafts[sessionId] ?? null,
      setDraft: (sessionId, draft) =>
        set((state) => {
          if (draft === null) {
            const { [sessionId]: _, ...rest } = state.drafts;
            return { drafts: rest };
          }
          return { drafts: { ...state.drafts, [sessionId]: draft } };
        }),
      clearDraft: (sessionId) =>
        set((state) => {
          const { [sessionId]: _, ...rest } = state.drafts;
          return { drafts: rest };
        }),
    }),
    {
      name: "message-drafts",
      onRehydrateStorage: () => (state) => {
        state?.setHasHydrated(true);
      },
    },
  ),
);
