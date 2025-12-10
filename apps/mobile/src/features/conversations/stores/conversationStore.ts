import { create } from "zustand";
import type { ConversationDetail } from "../types";

interface ConversationState {
  conversations: ConversationDetail[];
  isLoading: boolean;
  error: string | null;
  setConversations: (conversations: ConversationDetail[]) => void;
  setLoading: (isLoading: boolean) => void;
  setError: (error: string | null) => void;
}

export const useConversationStore = create<ConversationState>((set) => ({
  conversations: [],
  isLoading: false,
  error: null,
  setConversations: (conversations) => set({ conversations }),
  setLoading: (isLoading) => set({ isLoading }),
  setError: (error) => set({ error }),
}));

export function sortConversationsByDate(
  conversations: ConversationDetail[],
): ConversationDetail[] {
  return [...conversations].sort((a, b) => {
    const dateA = a.updated_at || a.created_at || "";
    const dateB = b.updated_at || b.created_at || "";
    return dateB.localeCompare(dateA);
  });
}
