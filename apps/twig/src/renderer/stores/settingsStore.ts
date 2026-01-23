import { create } from "zustand";
import { trpcVanilla } from "../trpc";

export type TerminalLayoutMode = "split" | "tabbed";
export type SendMessagesWith = "enter" | "cmd+enter";

interface SettingsState {
  terminalLayoutMode: TerminalLayoutMode;
  sendMessagesWith: SendMessagesWith;
  terminalFontFamily: string;
  terminalFontFamilyLoaded: boolean;
  isLoading: boolean;
  loadTerminalLayout: () => Promise<void>;
  setTerminalLayout: (mode: TerminalLayoutMode) => Promise<void>;
  loadSendMessagesWith: () => Promise<void>;
  setSendMessagesWith: (mode: SendMessagesWith) => Promise<void>;
  loadTerminalFontFamily: () => Promise<void>;
  setTerminalFontFamily: (fontFamily: string) => Promise<void>;
}

export const useSettingsStore = create<SettingsState>()((set) => ({
  terminalLayoutMode: "split",
  sendMessagesWith: "enter",
  terminalFontFamily: "monospace",
  terminalFontFamilyLoaded: false,
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

  loadTerminalFontFamily: async () => {
    try {
      const fontFamily = await trpcVanilla.secureStore.getItem.query({
        key: "terminalFontFamily",
      });
      if (typeof fontFamily === "string" && fontFamily.trim()) {
        set({ terminalFontFamily: fontFamily, terminalFontFamilyLoaded: true });
        return;
      }
      set({ terminalFontFamilyLoaded: true });
    } catch (_error) {
      set({ terminalFontFamilyLoaded: true });
    }
  },

  setTerminalFontFamily: async (fontFamily: string) => {
    const trimmedFontFamily = fontFamily.trim();
    const normalizedFontFamily = trimmedFontFamily || "monospace";
    try {
      await trpcVanilla.secureStore.setItem.query({
        key: "terminalFontFamily",
        value: normalizedFontFamily,
      });
      set({
        terminalFontFamily: trimmedFontFamily,
        terminalFontFamilyLoaded: true,
      });
    } catch (_error) {}
  },
}));
