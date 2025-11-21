import type { JSONContent } from "@tiptap/react";
import { create } from "zustand";
import { persist } from "zustand/middleware";

interface TaskInputStore {
  draft: JSONContent | null;
  setDraft: (draft: JSONContent | null) => void;
  clearDraft: () => void;
}

export const useTaskInputStore = create<TaskInputStore>()(
  persist(
    (set) => ({
      draft: null,
      setDraft: (draft) => set({ draft }),
      clearDraft: () => set({ draft: null }),
    }),
    {
      name: "task-input-draft",
    },
  ),
);
