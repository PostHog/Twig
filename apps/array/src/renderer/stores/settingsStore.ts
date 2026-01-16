import { create } from "zustand";
import { trpcVanilla } from "../trpc";

export type TerminalLayoutMode = "split" | "tabbed";
export type SendMessagesWith = "enter" | "cmd+enter";

interface SettingsState {
  terminalLayoutMode: TerminalLayoutMode;
  sendMessagesWith: SendMessagesWith;
  isLoading: boolean;
  loadTerminalLayout: () => Promise<void>;
  setTerminalLayout: (mode: TerminalLayoutMode) => Promise<void>;
  loadSendMessagesWith: () => Promise<void>;
  setSendMessagesWith: (mode: SendMessagesWith) => Promise<void>;
}

export const useSettingsStore = create<SettingsState>()((set) => ({
  terminalLayoutMode: "split",
  sendMessagesWith: "enter",
  isLoading: true,

  loadTerminalLayout: async () => {
    try {
      const mode = await trpcVanilla.secureStore.getItem.query({
        key: "terminalLayoutMode",
      });
      set({ terminalLayoutMode: mode as TerminalLayoutMode, isLoading: false });
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

  loadSendMessagesWith: async () => {
    try {
      const mode = await trpcVanilla.secureStore.getItem.query({
        key: "sendMessagesWith",
      });
      if (mode === "enter" || mode === "cmd+enter") {
        set({ sendMessagesWith: mode });
      }
    } catch (_error) {
      // Keep default value
    }
  },

  setSendMessagesWith: async (mode: SendMessagesWith) => {
    try {
      await trpcVanilla.secureStore.setItem.query({
        key: "sendMessagesWith",
        value: mode,
      });
      set({ sendMessagesWith: mode });
    } catch (_error) {}
  },
}));
