import { createJSONStorage, type StateStorage } from "zustand/middleware";

/**
 * Raw storage adapter that uses Electron IPC to persist state.
 */
const electronStorageRaw: StateStorage = {
  getItem: async (name: string): Promise<string | null> => {
    return window.electronAPI.rendererStore.getItem(name);
  },
  setItem: async (name: string, value: string): Promise<void> => {
    await window.electronAPI.rendererStore.setItem(name, value);
  },
  removeItem: async (name: string): Promise<void> => {
    await window.electronAPI.rendererStore.removeItem(name);
  },
};

export const electronStorage = createJSONStorage(() => electronStorageRaw);
