import { create } from "zustand";

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
      const mode = await window.electronAPI.settings.getTerminalLayout();
      set({ terminalLayoutMode: mode, isLoading: false });
    } catch (_error) {
      set({ terminalLayoutMode: "split", isLoading: false });
    }
  },

  setTerminalLayout: async (mode: TerminalLayoutMode) => {
    try {
      await window.electronAPI.settings.setTerminalLayout(mode);
      set({ terminalLayoutMode: mode });
    } catch (_error) {}
  },
}));
