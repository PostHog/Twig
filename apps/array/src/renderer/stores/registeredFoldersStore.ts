import type { RegisteredFolder } from "@shared/types";
import { create } from "zustand";

interface RegisteredFoldersState {
  folders: RegisteredFolder[];
  isLoaded: boolean;
  loadFolders: () => Promise<void>;
  addFolder: (folderPath: string) => Promise<RegisteredFolder>;
  removeFolder: (folderId: string) => Promise<void>;
  updateLastAccessed: (folderId: string) => Promise<void>;
  getFolderByPath: (path: string) => RegisteredFolder | undefined;
}

let updateDebounceTimer: ReturnType<typeof setTimeout> | null = null;

async function loadFolders(): Promise<RegisteredFolder[]> {
  return await window.electronAPI.folders.getFolders();
}

function updateFolderInList(
  folders: RegisteredFolder[],
  folder: RegisteredFolder,
): RegisteredFolder[] {
  const existing = folders.find((f) => f.id === folder.id);
  if (existing) {
    return folders.map((f) => (f.id === folder.id ? folder : f));
  }
  return [...folders, folder];
}

export const useRegisteredFoldersStore = create<RegisteredFoldersState>()(
  (set, get) => {
    (async () => {
      try {
        const folders = await loadFolders();
        set({ folders, isLoaded: true });
      } catch (error) {
        console.error("Failed to load folders:", error);
        set({ folders: [], isLoaded: true });
      }
    })();

    return {
      folders: [],
      isLoaded: false,

      loadFolders: async () => {
        try {
          const folders = await loadFolders();
          set({ folders, isLoaded: true });
        } catch (error) {
          console.error("Failed to load folders:", error);
          set({ folders: [], isLoaded: true });
        }
      },

      addFolder: async (folderPath: string) => {
        try {
          const folder = await window.electronAPI.folders.addFolder(folderPath);
          set((state) => ({
            folders: updateFolderInList(state.folders, folder),
          }));
          return folder;
        } catch (error) {
          console.error("Failed to add folder:", error);
          throw error;
        }
      },

      removeFolder: async (folderId: string) => {
        try {
          await window.electronAPI.folders.removeFolder(folderId);
          set((state) => ({
            folders: state.folders.filter((f) => f.id !== folderId),
          }));
        } catch (error) {
          console.error("Failed to remove folder:", error);
          throw error;
        }
      },

      updateLastAccessed: async (folderId: string) => {
        const folder = get().folders.find((f) => f.id === folderId);
        if (!folder) return;

        const now = new Date().toISOString();
        set((state) => ({
          folders: state.folders.map((f) =>
            f.id === folderId ? { ...f, lastAccessed: now } : f,
          ),
        }));

        if (updateDebounceTimer) {
          clearTimeout(updateDebounceTimer);
        }

        updateDebounceTimer = setTimeout(async () => {
          try {
            await window.electronAPI.folders.updateFolderAccessed(folderId);
          } catch (error) {
            console.error("Failed to update folder accessed time:", error);
          }
        }, 1000);
      },

      getFolderByPath: (path: string) => {
        return get().folders.find((f) => f.path === path);
      },
    };
  },
);
