import { create } from "zustand";

interface SessionViewState {
  showRawLogs: boolean;
  searchQuery: string;
  showSearch: boolean;
  lastGenerationDuration: number | null;
  generationStartTime: number | null;
}

interface SessionViewActions {
  toggleRawLogs: () => void;
  setShowRawLogs: (show: boolean) => void;
  setSearchQuery: (query: string) => void;
  toggleSearch: () => void;
  openSearch: () => void;
  closeSearch: () => void;
  startGeneration: () => void;
  endGeneration: () => void;
  reset: () => void;
}

type SessionViewStore = SessionViewState & SessionViewActions;

const initialState: SessionViewState = {
  showRawLogs: false,
  searchQuery: "",
  showSearch: false,
  lastGenerationDuration: null,
  generationStartTime: null,
};

export const useSessionViewStore = create<SessionViewStore>((set, get) => ({
  ...initialState,

  toggleRawLogs: () => set((state) => ({ showRawLogs: !state.showRawLogs })),

  setShowRawLogs: (show) => set({ showRawLogs: show }),

  setSearchQuery: (query) => set({ searchQuery: query }),

  toggleSearch: () =>
    set((state) => ({
      showSearch: !state.showSearch,
      searchQuery: state.showSearch ? "" : state.searchQuery,
    })),

  openSearch: () => set({ showSearch: true }),

  closeSearch: () => set({ showSearch: false, searchQuery: "" }),

  startGeneration: () => {
    if (get().generationStartTime === null) {
      set({ generationStartTime: Date.now(), lastGenerationDuration: null });
    }
  },

  endGeneration: () => {
    const { generationStartTime } = get();
    if (generationStartTime !== null) {
      set({
        lastGenerationDuration: Date.now() - generationStartTime,
        generationStartTime: null,
      });
    }
  },

  reset: () => set(initialState),
}));
