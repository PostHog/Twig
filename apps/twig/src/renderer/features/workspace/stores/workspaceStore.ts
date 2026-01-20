import { useRegisteredFoldersStore } from "@renderer/stores/registeredFoldersStore";
import { trpcVanilla } from "@renderer/trpc";
import type {
  CreateWorkspaceOptions,
  ScriptExecutionResult,
  Workspace,
  WorkspaceInfo,
  WorkspaceMode,
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
  workspaces: Record<string, Workspace>;
  isLoaded: boolean;
  isCreating: Record<string, boolean>;

  // Hydration
  loadWorkspaces: () => Promise<void>;

  // CRUD
  createWorkspace: (options: CreateWorkspaceOptions) => Promise<Workspace>;
  deleteWorkspace: (taskId: string, mainRepoPath: string) => Promise<void>;
  verifyWorkspace: (taskId: string) => Promise<boolean>;

  ensureWorkspace: (
    taskId: string,
    repoPath: string,
    mode?: WorkspaceMode,
    branch?: string | null,
  ) => Promise<Workspace>;

  // Operations
  runStartScripts: (taskId: string) => Promise<ScriptExecutionResult>;
  isWorkspaceRunning: (taskId: string) => Promise<boolean>;
  getWorkspaceTerminals: (taskId: string) => Promise<WorkspaceTerminalInfo[]>;

  // Convenience selectors (synchronous)
  getWorkspace: (taskId: string) => Workspace | null;
  getWorktreePath: (taskId: string) => string | null;
  getWorktreeName: (taskId: string) => string | null;
  getBranchName: (taskId: string) => string | null;
  getFolderPath: (taskId: string) => string | null;

  // Internal state management
  setCreating: (taskId: string, creating: boolean) => void;
  updateWorkspace: (taskId: string, workspace: Workspace) => void;
  removeWorkspace: (taskId: string) => void;
}

function workspaceInfoToWorkspace(
  info: WorkspaceInfo,
  folderId: string,
  folderPath: string,
): Workspace {
  return {
    taskId: info.taskId,
    folderId,
    folderPath,
    mode: info.mode,
    worktreePath: info.worktree?.worktreePath ?? null,
    worktreeName: info.worktree?.worktreeName ?? null,
    branchName: info.worktree?.branchName ?? null,
    baseBranch: info.worktree?.baseBranch ?? null,
    createdAt: info.worktree?.createdAt ?? new Date().toISOString(),
    terminalSessionIds: info.terminalSessionIds,
    hasStartScripts: info.hasStartScripts,
  };
}

const useWorkspaceStoreBase = create<WorkspaceState>()((set, get) => {
  (async () => {
    try {
      const workspaces = await trpcVanilla.workspace.getAll.query();
      if (workspaces) {
        // Merge with existing state to preserve workspaces created during load
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

    createWorkspace: async (options: CreateWorkspaceOptions) => {
      const { taskId, folderId, folderPath } = options;
      set((state) => ({
        isCreating: { ...state.isCreating, [taskId]: true },
      }));

      try {
        const workspaceInfo =
          await trpcVanilla.workspace.create.mutate(options);
        if (!workspaceInfo) {
          throw new Error("Failed to create workspace");
        }

        const workspace = workspaceInfoToWorkspace(
          workspaceInfo,
          folderId,
          folderPath,
        );

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

    deleteWorkspace: async (taskId: string, mainRepoPath: string) => {
      await trpcVanilla.workspace.delete.mutate({ taskId, mainRepoPath });
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
      repoPath: string,
      mode: WorkspaceMode = "worktree",
      branch?: string | null,
    ) => {
      // Return existing workspace if it exists
      const existing = get().workspaces[taskId];
      if (existing) {
        return existing;
      }

      // For cloud tasks, create a minimal workspace entry (no local worktree)
      if (mode === "cloud") {
        const { getFolderByPath, addFolder } =
          useRegisteredFoldersStore.getState();
        let folder = getFolderByPath(repoPath);
        if (!folder) {
          folder = await addFolder(repoPath);
        }

        const cloudWorkspace: Workspace = {
          taskId,
          folderId: folder.id,
          folderPath: repoPath,
          mode: "cloud",
          worktreePath: null,
          worktreeName: null,
          branchName: null,
          baseBranch: branch ?? null,
          createdAt: new Date().toISOString(),
          terminalSessionIds: [],
          hasStartScripts: false,
        };

        set((state) => ({
          workspaces: { ...state.workspaces, [taskId]: cloudWorkspace },
        }));

        // Persist cloud workspace to main process
        await trpcVanilla.workspace.create.mutate({
          taskId,
          mainRepoPath: repoPath,
          folderId: folder.id,
          folderPath: repoPath,
          mode: "cloud",
          branch: branch ?? undefined,
        });

        return cloudWorkspace;
      }

      // Atomically check if creating and set if not - this prevents race conditions
      let wasAlreadyCreating = false;
      set((state) => {
        if (state.isCreating[taskId]) {
          wasAlreadyCreating = true;
          return state; // No change
        }
        // Set creating flag atomically with the check
        return {
          ...state,
          isCreating: { ...state.isCreating, [taskId]: true },
        };
      });

      if (wasAlreadyCreating) {
        // Wait for creation to complete and return the workspace
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

        const workspaceInfo = await trpcVanilla.workspace.create.mutate({
          taskId,
          mainRepoPath: repoPath,
          folderId: folder.id,
          folderPath: repoPath,
          mode,
          branch: branch ?? undefined,
        });

        if (!workspaceInfo) {
          throw new Error("Failed to create workspace");
        }

        const workspace = workspaceInfoToWorkspace(
          workspaceInfo,
          folder.id,
          repoPath,
        );

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

      // Use worktreePath for worktree mode, folderPath for local mode
      const scriptPath = workspace.worktreePath ?? workspace.folderPath;
      const scriptName =
        workspace.worktreeName ?? workspace.folderPath.split("/").pop() ?? "";

      const result = await trpcVanilla.workspace.runStart.mutate({
        taskId,
        worktreePath: scriptPath,
        worktreeName: scriptName,
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

    getWorktreePath: (taskId: string) => {
      const workspace = get().workspaces[taskId];
      if (!workspace) return null;
      // In local mode, return folderPath; in worktree mode, return worktreePath
      return workspace.worktreePath ?? workspace.folderPath;
    },

    getWorktreeName: (taskId: string) => {
      return get().workspaces[taskId]?.worktreeName ?? null;
    },

    getBranchName: (taskId: string) => {
      return get().workspaces[taskId]?.branchName ?? null;
    },

    getFolderPath: (taskId: string) => {
      return get().workspaces[taskId]?.folderPath ?? null;
    },

    // Internal state management
    setCreating: (taskId: string, creating: boolean) => {
      set((state) => ({
        isCreating: { ...state.isCreating, [taskId]: creating },
      }));
    },

    updateWorkspace: (taskId: string, workspace: Workspace) => {
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

export const selectWorktreePath =
  (taskId: string) => (state: WorkspaceState) => {
    const workspace = state.workspaces[taskId];
    if (!workspace) return undefined;
    // In local mode, return folderPath; in worktree mode, return worktreePath
    return workspace.worktreePath ?? workspace.folderPath;
  };

export const selectWorktreeName = (taskId: string) => (state: WorkspaceState) =>
  state.workspaces[taskId]?.worktreeName;

export const selectBranchName = (taskId: string) => (state: WorkspaceState) =>
  state.workspaces[taskId]?.branchName;

export const selectIsCreating = (taskId: string) => (state: WorkspaceState) =>
  state.isCreating[taskId] ?? false;
