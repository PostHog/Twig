import { create } from "zustand";

interface SessionViewState {
  showRawLogs: boolean;
  searchQuery: string;
  showSearch: boolean;
  scrollPositions: Record<string, number>;
}

interface SessionViewActions {
  setShowRawLogs: (show: boolean) => void;
  setSearchQuery: (query: string) => void;
  toggleSearch: () => void;
  saveScrollPosition: (taskId: string, position: number) => void;
  getScrollPosition: (taskId: string) => number;
}

type SessionViewStore = SessionViewState & { actions: SessionViewActions };

const useStore = create<SessionViewStore>((set, get) => ({
  showRawLogs: false,
  searchQuery: "",
  showSearch: false,
  scrollPositions: {},
  actions: {
    setShowRawLogs: (show) => set({ showRawLogs: show }),
    setSearchQuery: (query) => set({ searchQuery: query }),
    toggleSearch: () =>
      set((state) => ({
        showSearch: !state.showSearch,
        searchQuery: state.showSearch ? "" : state.searchQuery,
      })),
    saveScrollPosition: (taskId, position) =>
      set((state) => ({
        scrollPositions: { ...state.scrollPositions, [taskId]: position },
      })),
    getScrollPosition: (taskId) => get().scrollPositions[taskId] ?? 0,
  },
}));

export const useShowRawLogs = () => useStore((s) => s.showRawLogs);
export const useSearchQuery = () => useStore((s) => s.searchQuery);
export const useShowSearch = () => useStore((s) => s.showSearch);
export const useSessionViewActions = () => useStore((s) => s.actions);
