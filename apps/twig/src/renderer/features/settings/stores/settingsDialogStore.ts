import { create } from "zustand";

export type SettingsCategory =
  | "chat"
  | "appearance"
  | "account"
  | "shortcuts"
  | "workspaces"
  | "claude-code"
  | "integrations"
  | "updates"
  | "advanced";

interface SettingsDialogState {
  isOpen: boolean;
  activeCategory: SettingsCategory;
}

interface SettingsDialogActions {
  open: (category?: SettingsCategory) => void;
  close: () => void;
  setCategory: (category: SettingsCategory) => void;
}

type SettingsDialogStore = SettingsDialogState & SettingsDialogActions;

export const useSettingsDialogStore = create<SettingsDialogStore>()(
  (set, get) => ({
    isOpen: false,
    activeCategory: "chat",

    open: (category) => {
      if (!get().isOpen) {
        window.history.pushState({ settingsOpen: true }, "");
      }
      set({
        isOpen: true,
        activeCategory: category ?? "chat",
      });
    },
    close: () => {
      if (get().isOpen && window.history.state?.settingsOpen) {
        window.history.back();
      }
      set({ isOpen: false });
    },
    setCategory: (category) => set({ activeCategory: category }),
  }),
);
