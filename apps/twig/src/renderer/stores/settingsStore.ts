import { create } from "zustand";
import { trpcVanilla } from "../trpc";

export type SendMessagesWith = "enter" | "cmd+enter";

interface SettingsState {
  sendMessagesWith: SendMessagesWith;
  terminalFontFamily: string;
  terminalFontFamilyLoaded: boolean;
  loadSendMessagesWith: () => Promise<void>;
  setSendMessagesWith: (mode: SendMessagesWith) => Promise<void>;
  loadTerminalFontFamily: () => Promise<void>;
  setTerminalFontFamily: (fontFamily: string) => Promise<void>;
}

export const useSettingsStore = create<SettingsState>()((set) => ({
  sendMessagesWith: "enter",
  terminalFontFamily: "monospace",
  terminalFontFamilyLoaded: false,

  loadSendMessagesWith: async () => {
    try {
      const mode = await trpcVanilla.secureStore.getItem.query({
        key: "sendMessagesWith",
      });
      if (mode === "enter" || mode === "cmd+enter") {
        set({ sendMessagesWith: mode });
      }
    } catch (_error) {}
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
