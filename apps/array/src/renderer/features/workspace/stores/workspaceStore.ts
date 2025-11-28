import type {
  CreateWorkspaceOptions,
  ScriptExecutionResult,
  Workspace,
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
  workspaces: Record<string, Workspace>;
  isLoaded: boolean;
  isCreating: Record<string, boolean>;

  // Hydration
  loadWorkspaces: () => Promise<void>;

  // CRUD
  createWorkspace: (options: CreateWorkspaceOptions) => Promise<Workspace>;
  deleteWorkspace: (taskId: string, mainRepoPath: string) => Promise<void>;
  verifyWorkspace: (taskId: string) => Promise<boolean>;

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
    worktreePath: info.worktree.worktreePath,
    worktreeName: info.worktree.worktreeName,
    branchName: info.worktree.branchName,
    baseBranch: info.worktree.baseBranch,
    createdAt: info.worktree.createdAt,
    terminalSessionIds: info.terminalSessionIds,
    hasStartScripts: info.hasStartScripts,
  };
}

const useWorkspaceStoreBase = create<WorkspaceState>()((set, get) => {
  (async () => {
    try {
      const workspaces = await window.electronAPI?.workspace.getAll();
      if (workspaces) {
        set({ workspaces, isLoaded: true });
        log.info(`Loaded ${Object.keys(workspaces).length} workspace(s)`);
      } else {
        set({ workspaces: {}, isLoaded: true });
      }
    } catch (error) {
      log.error("Failed to load workspaces:", error);
      set({ workspaces: {}, isLoaded: true });
    }
  })();

  return {
    workspaces: {},
    isLoaded: false,
    isCreating: {},

    loadWorkspaces: async () => {
      try {
        const workspaces = await window.electronAPI?.workspace.getAll();
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
          await window.electronAPI?.workspace.create(options);
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
      await window.electronAPI?.workspace.delete(taskId, mainRepoPath);
      set((state) => ({ workspaces: omitKey(state.workspaces, taskId) }));
    },

    verifyWorkspace: async (taskId: string) => {
      const exists = await window.electronAPI?.workspace.verify(taskId);
      if (!exists) {
        set((state) => ({ workspaces: omitKey(state.workspaces, taskId) }));
      }
      return exists ?? false;
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

      const result = await window.electronAPI?.workspace.runStart(
        taskId,
        workspace.worktreePath,
        workspace.worktreeName,
      );
      return (
        result ?? {
          success: false,
          terminalSessionIds: [],
          errors: ["API not available"],
        }
      );
    },

    isWorkspaceRunning: async (taskId: string) => {
      const running = await window.electronAPI?.workspace.isRunning(taskId);
      return running ?? false;
    },

    getWorkspaceTerminals: async (taskId: string) => {
      const terminals =
        await window.electronAPI?.workspace.getTerminals(taskId);
      return terminals ?? [];
    },

    // Convenience selectors
    getWorkspace: (taskId: string) => {
      return get().workspaces[taskId] ?? null;
    },

    getWorktreePath: (taskId: string) => {
      return get().workspaces[taskId]?.worktreePath ?? null;
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

export const selectWorktreePath = (taskId: string) => (state: WorkspaceState) =>
  state.workspaces[taskId]?.worktreePath;

export const selectWorktreeName = (taskId: string) => (state: WorkspaceState) =>
  state.workspaces[taskId]?.worktreeName;

export const selectBranchName = (taskId: string) => (state: WorkspaceState) =>
  state.workspaces[taskId]?.branchName;

export const selectIsCreating = (taskId: string) => (state: WorkspaceState) =>
  state.isCreating[taskId] ?? false;
