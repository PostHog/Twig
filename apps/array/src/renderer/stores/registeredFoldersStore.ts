import { logger } from "@renderer/lib/logger";
import { trpcVanilla } from "@renderer/trpc";
import type { RegisteredFolder } from "@shared/types";
import { create } from "zustand";

const log = logger.scope("registered-folders-store");

interface RegisteredFoldersState {
  folders: RegisteredFolder[];
  isLoaded: boolean;
  loadFolders: () => Promise<void>;
  addFolder: (folderPath: string) => Promise<RegisteredFolder>;
  removeFolder: (folderId: string) => Promise<void>;
  updateLastAccessed: (folderId: string) => Promise<void>;
  getFolderByPath: (path: string) => RegisteredFolder | undefined;
  getRecentFolders: (limit?: number) => RegisteredFolder[];
  getFolderDisplayName: (path: string) => string | null;
  cleanupOrphanedWorktrees: (mainRepoPath: string) => Promise<{
    deleted: string[];
    errors: Array<{ path: string; error: string }>;
  }>;
}

let updateDebounceTimer: ReturnType<typeof setTimeout> | null = null;

async function loadFolders(): Promise<RegisteredFolder[]> {
  return await trpcVanilla.folders.getFolders.query();
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
        const loadedFolders = await loadFolders();
        // Merge with existing state to preserve folders added during load
        set((state) => {
          // Dedupe by id, local state wins for freshness
          const byId = new Map<string, RegisteredFolder>();
          for (const f of loadedFolders) byId.set(f.id, f);
          for (const f of state.folders) byId.set(f.id, f);
          return { folders: Array.from(byId.values()), isLoaded: true };
        });

        const folders = get().folders;
        for (const folder of folders) {
          get()
            .cleanupOrphanedWorktrees(folder.path)
            .catch((error) => {
              log.error(
                `Failed to cleanup orphaned worktrees for ${folder.path}:`,
                error,
              );
            });
        }
      } catch (error) {
        log.error("Failed to load folders:", error);
        set({ isLoaded: true });
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
          log.error("Failed to load folders:", error);
          set({ folders: [], isLoaded: true });
        }
      },

      addFolder: async (folderPath: string) => {
        try {
          const folder = await trpcVanilla.folders.addFolder.mutate({
            folderPath,
          });
          set((state) => ({
            folders: updateFolderInList(state.folders, folder),
          }));
          return folder;
        } catch (error) {
          log.error("Failed to add folder:", error);
          throw error;
        }
      },

      removeFolder: async (folderId: string) => {
        try {
          await trpcVanilla.folders.removeFolder.mutate({ folderId });
          set((state) => ({
            folders: state.folders.filter((f) => f.id !== folderId),
          }));
        } catch (error) {
          log.error("Failed to remove folder:", error);
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
            await trpcVanilla.folders.updateFolderAccessed.mutate({ folderId });
          } catch (error) {
            log.error("Failed to update folder accessed time:", error);
          }
        }, 1000);
      },

      getFolderByPath: (path: string) => {
        return get().folders.find((f) => f.path === path);
      },

      getRecentFolders: (limit = 5) => {
        return [...get().folders]
          .sort(
            (a, b) =>
              new Date(b.lastAccessed).getTime() -
              new Date(a.lastAccessed).getTime(),
          )
          .slice(0, limit);
      },

      getFolderDisplayName: (path: string) => {
        if (!path) return null;
        const folder = get().folders.find((f) => f.path === path);
        return folder?.name ?? path.split("/").pop() ?? null;
      },

      cleanupOrphanedWorktrees: async (mainRepoPath: string) => {
        try {
          return await trpcVanilla.folders.cleanupOrphanedWorktrees.mutate({
            mainRepoPath,
          });
        } catch (error) {
          log.error("Failed to cleanup orphaned worktrees:", error);
          return {
            deleted: [],
            errors: [{ path: mainRepoPath, error: String(error) }],
          };
        }
      },
    };
  },
);
