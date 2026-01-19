import { useRegisteredFoldersStore } from "@renderer/stores/registeredFoldersStore";
import { trpcVanilla } from "@renderer/trpc";
import type {
  CreateWorkspaceOptions,
  ScriptExecutionResult,
  WorkspaceInfo,
  WorkspaceTerminalInfo,
} from "@shared/types";
import type { StoreApi, UseBoundStore } from "zustand";
import { create } from "zustand";
import { logger } from "@/renderer/lib/logger";
import { omitKey } from "@/renderer/utils/object";

const log = logger.scope("workspaceStore");

type WithSelectors<S> = S extends { getState: () => infer T }
  ? S & { use: { [K in keyof T]: () => T[K] } }
  : never;

function createSelectors<S extends UseBoundStore<StoreApi<object>>>(_store: S) {
  const store = _store as WithSelectors<typeof _store>;
  store.use = {} as typeof store.use;
  for (const k of Object.keys(store.getState())) {
    (store.use as Record<string, () => unknown>)[k] = () =>
      store((s) => s[k as keyof typeof s]);
  }
  return store;
}

interface WorkspaceState {
  workspaces: Record<string, WorkspaceInfo>;
  isLoaded: boolean;
  isCreating: Record<string, boolean>;

  // Hydration
  loadWorkspaces: () => Promise<void>;

  // CRUD
  createWorkspace: (
    options: CreateWorkspaceOptions & { taskTitle: string },
  ) => Promise<WorkspaceInfo>;
  deleteWorkspace: (taskId: string) => Promise<void>;
  verifyWorkspace: (taskId: string) => Promise<boolean>;

  ensureWorkspace: (
    taskId: string,
    taskTitle: string,
    repoPath: string,
  ) => Promise<WorkspaceInfo>;

  // Operations
  runStartScripts: (taskId: string) => Promise<ScriptExecutionResult>;
  isWorkspaceRunning: (taskId: string) => Promise<boolean>;
  getWorkspaceTerminals: (taskId: string) => Promise<WorkspaceTerminalInfo[]>;

  // Convenience selectors (synchronous)
  getWorkspace: (taskId: string) => WorkspaceInfo | null;
  getWorkspacePath: (taskId: string) => string | null;
  getWorkspaceName: (taskId: string) => string | null;
  getRepoPath: (taskId: string) => string | null;

  // Internal state management
  setCreating: (taskId: string, creating: boolean) => void;
  updateWorkspace: (taskId: string, workspace: WorkspaceInfo) => void;
  removeWorkspace: (taskId: string) => void;
}

const useWorkspaceStoreBase = create<WorkspaceState>()((set, get) => {
  (async () => {
    try {
      const workspaces = await trpcVanilla.workspace.getAll.query();
      if (workspaces) {
        set((state) => ({
          workspaces: { ...workspaces, ...state.workspaces },
          isLoaded: true,
        }));
      } else {
        set({ isLoaded: true });
      }
    } catch (error) {
      log.error("Failed to load workspaces:", error);
      set({ isLoaded: true });
    }
  })();

  return {
    workspaces: {},
    isLoaded: false,
    isCreating: {},

    loadWorkspaces: async () => {
      try {
        const workspaces = await trpcVanilla.workspace.getAll.query();
        set({ workspaces: workspaces ?? {}, isLoaded: true });
      } catch (error) {
        log.error("Failed to load workspaces:", error);
        set({ workspaces: {}, isLoaded: true });
      }
    },

    createWorkspace: async (options) => {
      const { taskId, folderId, taskTitle, repoPath } = options;
      set((state) => ({
        isCreating: { ...state.isCreating, [taskId]: true },
      }));

      try {
        const workspace = await trpcVanilla.workspace.create.mutate({
          taskId,
          taskTitle,
          repoPath,
          folderId,
        });
        if (!workspace) {
          throw new Error("Failed to create workspace");
        }

        set((state) => ({
          workspaces: { ...state.workspaces, [taskId]: workspace },
          isCreating: { ...state.isCreating, [taskId]: false },
        }));

        return workspace;
      } catch (error) {
        set((state) => ({
          isCreating: { ...state.isCreating, [taskId]: false },
        }));
        throw error;
      }
    },

    deleteWorkspace: async (taskId: string) => {
      await trpcVanilla.workspace.delete.mutate({ taskId });
      set((state) => ({ workspaces: omitKey(state.workspaces, taskId) }));
    },

    verifyWorkspace: async (taskId: string) => {
      const exists = await trpcVanilla.workspace.verify.query({ taskId });
      if (!exists) {
        set((state) => ({ workspaces: omitKey(state.workspaces, taskId) }));
      }
      return exists ?? false;
    },

    ensureWorkspace: async (
      taskId: string,
      taskTitle: string,
      repoPath: string,
    ) => {
      // Return existing workspace if it exists
      const existing = get().workspaces[taskId];
      if (existing) {
        return existing;
      }

      // Atomically check if creating and set if not
      let wasAlreadyCreating = false;
      set((state) => {
        if (state.isCreating[taskId]) {
          wasAlreadyCreating = true;
          return state;
        }
        return {
          ...state,
          isCreating: { ...state.isCreating, [taskId]: true },
        };
      });

      if (wasAlreadyCreating) {
        return new Promise((resolve, reject) => {
          const checkInterval = setInterval(() => {
            const current = get();
            if (!current.isCreating[taskId]) {
              clearInterval(checkInterval);
              const workspace = current.workspaces[taskId];
              if (workspace) {
                resolve(workspace);
              } else {
                reject(new Error("Workspace creation failed"));
              }
            }
          }, 100);
        });
      }

      try {
        // Ensure folder is registered
        const { getFolderByPath, addFolder } =
          useRegisteredFoldersStore.getState();
        let folder = getFolderByPath(repoPath);
        if (!folder) {
          folder = await addFolder(repoPath);
        }

        const workspace = await trpcVanilla.workspace.create.mutate({
          taskId,
          taskTitle,
          repoPath,
          folderId: folder.id,
        });

        if (!workspace) {
          throw new Error("Failed to create workspace");
        }

        set((state) => ({
          workspaces: { ...state.workspaces, [taskId]: workspace },
          isCreating: { ...state.isCreating, [taskId]: false },
        }));

        return workspace;
      } catch (error) {
        set((state) => ({
          isCreating: { ...state.isCreating, [taskId]: false },
        }));
        throw error;
      }
    },

    runStartScripts: async (taskId: string) => {
      const workspace = get().workspaces[taskId];
      if (!workspace) {
        return {
          success: false,
          terminalSessionIds: [],
          errors: ["Workspace not found"],
        };
      }

      const result = await trpcVanilla.workspace.runStart.mutate({
        taskId,
        workspacePath: workspace.workspacePath,
        workspaceName: workspace.workspaceName,
      });
      return (
        result ?? {
          success: false,
          terminalSessionIds: [],
          errors: ["API not available"],
        }
      );
    },

    isWorkspaceRunning: async (taskId: string) => {
      const running = await trpcVanilla.workspace.isRunning.query({ taskId });
      return running ?? false;
    },

    getWorkspaceTerminals: async (taskId: string) => {
      const terminals = await trpcVanilla.workspace.getTerminals.query({
        taskId,
      });
      return terminals ?? [];
    },

    // Convenience selectors
    getWorkspace: (taskId: string) => {
      return get().workspaces[taskId] ?? null;
    },

    getWorkspacePath: (taskId: string) => {
      return get().workspaces[taskId]?.workspacePath ?? null;
    },

    getWorkspaceName: (taskId: string) => {
      return get().workspaces[taskId]?.workspaceName ?? null;
    },

    getRepoPath: (taskId: string) => {
      return get().workspaces[taskId]?.repoPath ?? null;
    },

    // Internal state management
    setCreating: (taskId: string, creating: boolean) => {
      set((state) => ({
        isCreating: { ...state.isCreating, [taskId]: creating },
      }));
    },

    updateWorkspace: (taskId: string, workspace: WorkspaceInfo) => {
      set((state) => ({
        workspaces: { ...state.workspaces, [taskId]: workspace },
      }));
    },

    removeWorkspace: (taskId: string) => {
      set((state) => ({ workspaces: omitKey(state.workspaces, taskId) }));
    },
  };
});

// Wrap store with auto-generated selectors for top-level state
export const useWorkspaceStore = createSelectors(useWorkspaceStoreBase);

// Selector factories for parameterized access (taskId-based)
export const selectWorkspace = (taskId: string) => (state: WorkspaceState) =>
  state.workspaces[taskId];

export const selectWorkspacePath =
  (taskId: string) => (state: WorkspaceState) =>
    state.workspaces[taskId]?.workspacePath;

export const selectWorkspaceName =
  (taskId: string) => (state: WorkspaceState) =>
    state.workspaces[taskId]?.workspaceName;

export const selectIsCreating = (taskId: string) => (state: WorkspaceState) =>
  state.isCreating[taskId] ?? false;
