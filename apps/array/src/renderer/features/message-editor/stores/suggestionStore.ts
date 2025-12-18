import { create } from "zustand";
import { immer } from "zustand/middleware/immer";
import type {
  SuggestionItem,
  SuggestionLoadingState,
  SuggestionPosition,
  SuggestionType,
} from "../types";

interface SuggestionState {
  active: boolean;
  sessionId: string | null;
  type: SuggestionType | null;
  items: SuggestionItem[];
  selectedIndex: number;
  position: SuggestionPosition | null;
  loadingState: SuggestionLoadingState;
  error: string | null;
  onSelect: ((index: number) => void) | null;
}

export interface SuggestionActions {
  open: (
    sessionId: string,
    type: SuggestionType,
    position: SuggestionPosition,
    onSelect?: (index: number) => void,
  ) => void;
  close: () => void;
  setItems: (items: SuggestionItem[]) => void;
  setLoadingState: (state: SuggestionLoadingState, error?: string) => void;
  selectNext: () => void;
  selectPrevious: () => void;
  setSelectedIndex: (index: number) => void;
  updatePosition: (position: SuggestionPosition) => void;
  getSelectedItem: () => SuggestionItem | null;
  selectItem: (index: number) => void;
}

type SuggestionStore = SuggestionState & { actions: SuggestionActions };

const DEFAULT_STATE: Omit<SuggestionState, "actions"> = {
  active: false,
  sessionId: null,
  type: null,
  items: [],
  selectedIndex: 0,
  position: null,
  loadingState: "idle",
  error: null,
  onSelect: null,
};

export const useSuggestionStore = create<SuggestionStore>()(
  immer((set, get) => ({
    ...DEFAULT_STATE,

    actions: {
      open: (sessionId, type, position, onSelect) =>
        set((state) => {
          state.active = true;
          state.sessionId = sessionId;
          state.type = type;
          state.items = [];
          state.selectedIndex = 0;
          state.position = position;
          state.loadingState = "idle";
          state.error = null;
          state.onSelect = onSelect ?? null;
        }),

      close: () =>
        set((state) => {
          state.active = false;
          state.sessionId = null;
          state.type = null;
          state.items = [];
          state.selectedIndex = 0;
          state.position = null;
          state.loadingState = "idle";
          state.error = null;
          state.onSelect = null;
        }),

      setItems: (items) =>
        set((state) => {
          state.items = items;
          state.selectedIndex = 0;
        }),

      setLoadingState: (loadingState, error) =>
        set((state) => {
          state.loadingState = loadingState;
          state.error = error ?? null;
        }),

      selectNext: () =>
        set((state) => {
          if (state.items.length === 0) return;
          state.selectedIndex = (state.selectedIndex + 1) % state.items.length;
        }),

      selectPrevious: () =>
        set((state) => {
          if (state.items.length === 0) return;
          state.selectedIndex =
            (state.selectedIndex - 1 + state.items.length) % state.items.length;
        }),

      setSelectedIndex: (index) =>
        set((state) => {
          state.selectedIndex = index;
        }),

      updatePosition: (position) =>
        set((state) => {
          state.position = position;
        }),

      getSelectedItem: () => {
        const state = get();
        return state.items[state.selectedIndex] ?? null;
      },

      selectItem: (index) => {
        const state = get();
        if (state.onSelect) {
          state.onSelect(index);
        }
      },
    },
  })),
);
