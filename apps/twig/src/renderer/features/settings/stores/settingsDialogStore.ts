import { create } from "zustand";

export type SettingsCategory =
  | "general"
  | "account"
  | "workspaces"
  | "personalization"
  | "claude-code"
  | "shortcuts"
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
    activeCategory: "general",

    open: (category) => {
      if (!get().isOpen) {
        window.history.pushState({ settingsOpen: true }, "");
      }
      set({
        isOpen: true,
        activeCategory: category ?? "general",
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
