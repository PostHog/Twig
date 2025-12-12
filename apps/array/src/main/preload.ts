import type { ContentBlock } from "@agentclientprotocol/sdk";
import { contextBridge, type IpcRendererEvent, ipcRenderer } from "electron";
import { exposeElectronTRPC } from "trpc-electron/main";
import type {
  CreateWorkspaceOptions,
  RegisteredFolder,
  ScriptExecutionResult,
  Workspace,
  WorkspaceInfo,
  WorkspaceTerminalInfo,
  WorktreeInfo,
} from "../shared/types";
import type { CloudRegion, OAuthTokenResponse } from "../shared/types/oauth";
import type {
  ExternalAppContextMenuResult,
  FolderContextMenuResult,
  SplitContextMenuResult,
  TabContextMenuResult,
  TaskContextMenuResult,
} from "./services/contextMenu.types.js";
import "electron-log/preload";

process.once("loaded", () => {
  exposeElectronTRPC();
});

/// -- Legacy IPC handlers -- ///

type IpcEventListener<T> = (data: T) => void;

function createIpcListener<T>(
  channel: string,
  listener: IpcEventListener<T>,
): () => void {
  const wrapped = (_event: IpcRendererEvent, data: T) => listener(data);
  ipcRenderer.on(channel, wrapped);
  return () => ipcRenderer.removeListener(channel, wrapped);
}

function createVoidIpcListener(
  channel: string,
  listener: () => void,
): () => void {
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
}

interface AgentStartParams {
  taskId: string;
  taskRunId: string;
  repoPath: string;
  apiKey: string;
  apiHost: string;
  projectId: number;
  permissionMode?: string;
  autoProgress?: boolean;
  model?: string;
  executionMode?: "plan";
  runMode?: "local" | "cloud";
  createPR?: boolean;
}

contextBridge.exposeInMainWorld("electronAPI", {
  // OAuth API
  oauthStartFlow: (
    region: CloudRegion,
  ): Promise<{ success: boolean; data?: OAuthTokenResponse; error?: string }> =>
    ipcRenderer.invoke("oauth:start-flow", region),
  oauthRefreshToken: (
    refreshToken: string,
    region: CloudRegion,
  ): Promise<{ success: boolean; data?: OAuthTokenResponse; error?: string }> =>
    ipcRenderer.invoke("oauth:refresh-token", refreshToken, region),
  oauthCancelFlow: (): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke("oauth:cancel-flow"),
  // Repo API
  validateRepo: (directoryPath: string): Promise<boolean> =>
    ipcRenderer.invoke("validate-repo", directoryPath),
  detectRepo: (
    directoryPath: string,
  ): Promise<{
    organization: string;
    repository: string;
    branch?: string;
    remote?: string;
  } | null> => ipcRenderer.invoke("detect-repo", directoryPath),
  cloneRepository: (
    repoUrl: string,
    targetPath: string,
    cloneId: string,
  ): Promise<{ cloneId: string }> =>
    ipcRenderer.invoke("clone-repository", repoUrl, targetPath, cloneId),
  onCloneProgress: (
    cloneId: string,
    listener: (event: {
      status: "cloning" | "complete" | "error";
      message: string;
    }) => void,
  ): (() => void) => createIpcListener(`clone-progress:${cloneId}`, listener),
  listRepoFiles: (
    repoPath: string,
    query?: string,
    limit?: number,
  ): Promise<Array<{ path: string; name: string }>> =>
    ipcRenderer.invoke("list-repo-files", repoPath, query, limit),
  // Agent API
  agentStart: async (
    params: AgentStartParams,
  ): Promise<{ sessionId: string; channel: string }> =>
    ipcRenderer.invoke("agent-start", params),
  agentPrompt: async (
    sessionId: string,
    prompt: ContentBlock[],
  ): Promise<{ stopReason: string }> =>
    ipcRenderer.invoke("agent-prompt", sessionId, prompt),
  agentCancel: async (sessionId: string): Promise<boolean> =>
    ipcRenderer.invoke("agent-cancel", sessionId),
  agentCancelPrompt: async (sessionId: string): Promise<boolean> =>
    ipcRenderer.invoke("agent-cancel-prompt", sessionId),
  agentReconnect: async (params: {
    taskId: string;
    taskRunId: string;
    repoPath: string;
    apiKey: string;
    apiHost: string;
    projectId: number;
    logUrl?: string;
    sdkSessionId?: string;
  }): Promise<{ sessionId: string; channel: string } | null> =>
    ipcRenderer.invoke("agent-reconnect", params),
  agentTokenRefresh: async (
    taskRunId: string,
    newToken: string,
  ): Promise<void> =>
    ipcRenderer.invoke("agent-token-refresh", taskRunId, newToken),
  agentSetModel: async (sessionId: string, modelId: string): Promise<void> =>
    ipcRenderer.invoke("agent-set-model", sessionId, modelId),
  onAgentEvent: (
    channel: string,
    listener: (payload: unknown) => void,
  ): (() => void) => createIpcListener(channel, listener),
  // Plan mode operations
  readRepoFile: (repoPath: string, filePath: string): Promise<string | null> =>
    ipcRenderer.invoke("read-repo-file", repoPath, filePath),
  writeRepoFile: (
    repoPath: string,
    filePath: string,
    content: string,
  ): Promise<void> =>
    ipcRenderer.invoke("write-repo-file", repoPath, filePath, content),
  getChangedFilesHead: (
    repoPath: string,
  ): Promise<Array<{ path: string; status: string; originalPath?: string }>> =>
    ipcRenderer.invoke("get-changed-files-head", repoPath),
  getFileAtHead: (repoPath: string, filePath: string): Promise<string | null> =>
    ipcRenderer.invoke("get-file-at-head", repoPath, filePath),
  getDiffStats: (
    repoPath: string,
  ): Promise<{
    filesChanged: number;
    linesAdded: number;
    linesRemoved: number;
  }> => ipcRenderer.invoke("get-diff-stats", repoPath),
  getCurrentBranch: (repoPath: string): Promise<string | undefined> =>
    ipcRenderer.invoke("get-current-branch", repoPath),
  getDefaultBranch: (repoPath: string): Promise<string> =>
    ipcRenderer.invoke("get-default-branch", repoPath),
  getAllBranches: (repoPath: string): Promise<string[]> =>
    ipcRenderer.invoke("get-all-branches", repoPath),
  createBranch: (repoPath: string, branchName: string): Promise<void> =>
    ipcRenderer.invoke("create-branch", repoPath, branchName),
  discardFileChanges: (
    repoPath: string,
    filePath: string,
    fileStatus: string,
  ): Promise<void> =>
    ipcRenderer.invoke("discard-file-changes", repoPath, filePath, fileStatus),
  getGitSyncStatus: (
    repoPath: string,
  ): Promise<{
    ahead: number;
    behind: number;
    hasRemote: boolean;
    currentBranch: string | null;
    isFeatureBranch: boolean;
  }> => ipcRenderer.invoke("get-git-sync-status", repoPath),
  getLatestCommit: (
    repoPath: string,
  ): Promise<{
    sha: string;
    shortSha: string;
    message: string;
    author: string;
    date: string;
  } | null> => ipcRenderer.invoke("get-latest-commit", repoPath),
  getGitRepoInfo: (
    repoPath: string,
  ): Promise<{
    organization: string;
    repository: string;
    currentBranch: string | null;
    defaultBranch: string;
    compareUrl: string | null;
  } | null> => ipcRenderer.invoke("get-git-repo-info", repoPath),
  listDirectory: (
    dirPath: string,
  ): Promise<
    Array<{ name: string; path: string; type: "file" | "directory" }>
  > => ipcRenderer.invoke("fs:list-directory", dirPath),
  watcherStart: (repoPath: string): Promise<void> =>
    ipcRenderer.invoke("watcher:start", repoPath),
  watcherStop: (repoPath: string): Promise<void> =>
    ipcRenderer.invoke("watcher:stop", repoPath),
  onDirectoryChanged: (
    listener: IpcEventListener<{ repoPath: string; dirPath: string }>,
  ): (() => void) => createIpcListener("fs:directory-changed", listener),
  onFileChanged: (
    listener: IpcEventListener<{ repoPath: string; filePath: string }>,
  ): (() => void) => createIpcListener("fs:file-changed", listener),
  onFileDeleted: (
    listener: IpcEventListener<{ repoPath: string; filePath: string }>,
  ): (() => void) => createIpcListener("fs:file-deleted", listener),
  onGitStateChanged: (
    listener: IpcEventListener<{ repoPath: string }>,
  ): (() => void) => createIpcListener("git:state-changed", listener),
  onOpenSettings: (listener: () => void): (() => void) =>
    createVoidIpcListener("open-settings", listener),
  onNewTask: (listener: () => void): (() => void) =>
    createVoidIpcListener("new-task", listener),
  onResetLayout: (listener: () => void): (() => void) =>
    createVoidIpcListener("reset-layout", listener),
  onClearStorage: (listener: () => void): (() => void) =>
    createVoidIpcListener("clear-storage", listener),
  getAppVersion: (): Promise<string> => ipcRenderer.invoke("app:get-version"),
  onUpdateReady: (listener: () => void): (() => void) =>
    createVoidIpcListener("updates:ready", listener),
  installUpdate: (): Promise<{ installed: boolean }> =>
    ipcRenderer.invoke("updates:install"),
  checkForUpdates: (): Promise<{
    success: boolean;
    error?: string;
  }> => ipcRenderer.invoke("updates:check"),
  onUpdateStatus: (
    listener: IpcEventListener<{
      checking?: boolean;
      upToDate?: boolean;
    }>,
  ): (() => void) => createIpcListener("updates:status", listener),
  onCheckForUpdatesMenu: (listener: () => void): (() => void) =>
    createVoidIpcListener("check-for-updates-menu", listener),
  shellCreate: (
    sessionId: string,
    cwd?: string,
    taskId?: string,
  ): Promise<void> =>
    ipcRenderer.invoke("shell:create", sessionId, cwd, taskId),
  shellWrite: (sessionId: string, data: string): Promise<void> =>
    ipcRenderer.invoke("shell:write", sessionId, data),
  shellResize: (sessionId: string, cols: number, rows: number): Promise<void> =>
    ipcRenderer.invoke("shell:resize", sessionId, cols, rows),
  shellCheck: (sessionId: string): Promise<boolean> =>
    ipcRenderer.invoke("shell:check", sessionId),
  shellDestroy: (sessionId: string): Promise<void> =>
    ipcRenderer.invoke("shell:destroy", sessionId),
  shellGetProcess: (sessionId: string): Promise<string | null> =>
    ipcRenderer.invoke("shell:get-process", sessionId),
  onShellData: (
    sessionId: string,
    listener: (data: string) => void,
  ): (() => void) => createIpcListener(`shell:data:${sessionId}`, listener),
  onShellExit: (sessionId: string, listener: () => void): (() => void) =>
    createVoidIpcListener(`shell:exit:${sessionId}`, listener),
  // Context Menu API
  showTaskContextMenu: (
    taskId: string,
    taskTitle: string,
    worktreePath?: string,
  ): Promise<TaskContextMenuResult> =>
    ipcRenderer.invoke(
      "show-task-context-menu",
      taskId,
      taskTitle,
      worktreePath,
    ),
  showFolderContextMenu: (
    folderId: string,
    folderName: string,
    folderPath?: string,
  ): Promise<FolderContextMenuResult> =>
    ipcRenderer.invoke(
      "show-folder-context-menu",
      folderId,
      folderName,
      folderPath,
    ),
  showTabContextMenu: (
    canClose: boolean,
    filePath?: string,
  ): Promise<TabContextMenuResult> =>
    ipcRenderer.invoke("show-tab-context-menu", canClose, filePath),
  showSplitContextMenu: (): Promise<SplitContextMenuResult> =>
    ipcRenderer.invoke("show-split-context-menu"),
  showFileContextMenu: (
    filePath: string,
    options?: { showCollapseAll?: boolean },
  ): Promise<ExternalAppContextMenuResult> =>
    ipcRenderer.invoke("show-file-context-menu", filePath, options),
  folders: {
    getFolders: (): Promise<RegisteredFolder[]> =>
      ipcRenderer.invoke("get-folders"),
    addFolder: (folderPath: string): Promise<RegisteredFolder> =>
      ipcRenderer.invoke("add-folder", folderPath),
    removeFolder: (folderId: string): Promise<void> =>
      ipcRenderer.invoke("remove-folder", folderId),
    updateFolderAccessed: (folderId: string): Promise<void> =>
      ipcRenderer.invoke("update-folder-accessed", folderId),
    clearAllData: (): Promise<void> => ipcRenderer.invoke("clear-all-data"),
    cleanupOrphanedWorktrees: (
      mainRepoPath: string,
    ): Promise<{
      deleted: string[];
      errors: Array<{ path: string; error: string }>;
    }> => ipcRenderer.invoke("cleanup-orphaned-worktrees", mainRepoPath),
  },
  // Worktree API
  worktree: {
    create: (mainRepoPath: string): Promise<WorktreeInfo> =>
      ipcRenderer.invoke("worktree-create", mainRepoPath),
    delete: (mainRepoPath: string, worktreePath: string): Promise<void> =>
      ipcRenderer.invoke("worktree-delete", mainRepoPath, worktreePath),
    getInfo: (
      mainRepoPath: string,
      worktreePath: string,
    ): Promise<WorktreeInfo | null> =>
      ipcRenderer.invoke("worktree-get-info", mainRepoPath, worktreePath),
    exists: (mainRepoPath: string, name: string): Promise<boolean> =>
      ipcRenderer.invoke("worktree-exists", mainRepoPath, name),
    list: (mainRepoPath: string): Promise<WorktreeInfo[]> =>
      ipcRenderer.invoke("worktree-list", mainRepoPath),
    isWorktree: (mainRepoPath: string, repoPath: string): Promise<boolean> =>
      ipcRenderer.invoke("worktree-is-worktree", mainRepoPath, repoPath),
    getMainRepoPath: (
      mainRepoPath: string,
      worktreePath: string,
    ): Promise<string | null> =>
      ipcRenderer.invoke("worktree-get-main-repo", mainRepoPath, worktreePath),
  },
  // External Apps API
  externalApps: {
    getDetectedApps: (): Promise<
      Array<{
        id: string;
        name: string;
        type: "editor" | "terminal";
        path: string;
        command: string;
        icon?: string;
      }>
    > => ipcRenderer.invoke("external-apps:get-detected-apps"),
    openInApp: (
      appId: string,
      path: string,
    ): Promise<{ success: boolean; error?: string }> =>
      ipcRenderer.invoke("external-apps:open-in-app", appId, path),
    setLastUsed: (appId: string): Promise<void> =>
      ipcRenderer.invoke("external-apps:set-last-used", appId),
    getLastUsed: (): Promise<{
      lastUsedApp?: string;
    }> => ipcRenderer.invoke("external-apps:get-last-used"),
    copyPath: (path: string): Promise<void> =>
      ipcRenderer.invoke("external-apps:copy-path", path),
  },
  // Workspace API
  workspace: {
    create: (options: CreateWorkspaceOptions): Promise<WorkspaceInfo> =>
      ipcRenderer.invoke("workspace:create", options),
    delete: (taskId: string, mainRepoPath: string): Promise<void> =>
      ipcRenderer.invoke("workspace:delete", taskId, mainRepoPath),
    verify: (taskId: string): Promise<boolean> =>
      ipcRenderer.invoke("workspace:verify", taskId),
    getInfo: (taskId: string): Promise<WorkspaceInfo | null> =>
      ipcRenderer.invoke("workspace:get-info", taskId),
    getAll: (): Promise<Record<string, Workspace>> =>
      ipcRenderer.invoke("workspace:get-all"),
    runStart: (
      taskId: string,
      worktreePath: string,
      worktreeName: string,
    ): Promise<ScriptExecutionResult> =>
      ipcRenderer.invoke(
        "workspace:run-start",
        taskId,
        worktreePath,
        worktreeName,
      ),
    isRunning: (taskId: string): Promise<boolean> =>
      ipcRenderer.invoke("workspace:is-running", taskId),
    getTerminals: (taskId: string): Promise<WorkspaceTerminalInfo[]> =>
      ipcRenderer.invoke("workspace:get-terminals", taskId),
    onTerminalCreated: (
      listener: IpcEventListener<WorkspaceTerminalInfo & { taskId: string }>,
    ): (() => void) =>
      createIpcListener("workspace:terminal-created", listener),
    onError: (
      listener: IpcEventListener<{ taskId: string; message: string }>,
    ): (() => void) => createIpcListener("workspace:error", listener),
    onWarning: (
      listener: IpcEventListener<{
        taskId: string;
        title: string;
        message: string;
      }>,
    ): (() => void) => createIpcListener("workspace:warning", listener),
  },
  // Dock Badge API
  dockBadge: {
    show: (): Promise<void> => ipcRenderer.invoke("dock-badge:show"),
  },
});
