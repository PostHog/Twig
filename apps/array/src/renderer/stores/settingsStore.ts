import { create } from "zustand";
import { trpcVanilla } from "../trpc";

export type TerminalLayoutMode = "split" | "tabbed";

interface SettingsState {
  terminalLayoutMode: TerminalLayoutMode;
  isLoading: boolean;
  loadTerminalLayout: () => Promise<void>;
  setTerminalLayout: (mode: TerminalLayoutMode) => Promise<void>;
}

export const useSettingsStore = create<SettingsState>()((set) => ({
  terminalLayoutMode: "split",
  isLoading: true,

  loadTerminalLayout: async () => {
    try {
      const mode = await trpcVanilla.secureStore.getItem.query({
        key: "terminalLayoutMode",
      });
      set({
        terminalLayoutMode: (mode as TerminalLayoutMode) || "split",
        isLoading: false,
      });
    } catch (_error) {
      set({ terminalLayoutMode: "split", isLoading: false });
    }
  },

  setTerminalLayout: async (mode: TerminalLayoutMode) => {
    try {
      await trpcVanilla.secureStore.setItem.query({
        key: "terminalLayoutMode",
        value: mode,
      });
      set({ terminalLayoutMode: mode });
    } catch (_error) {}
  },
}));
