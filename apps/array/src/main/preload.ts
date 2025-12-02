import type { AgentEvent } from "@posthog/agent";
import { contextBridge, type IpcRendererEvent, ipcRenderer } from "electron";
import type { CloudRegion, OAuthTokenResponse } from "../shared/types/oauth";
import type {
  ExternalAppContextMenuResult,
  FolderContextMenuResult,
  SplitContextMenuResult,
  TabContextMenuResult,
  TaskContextMenuResult,
} from "./services/contextMenu.types.js";
import "electron-log/preload";

interface MessageBoxOptions {
  type?: "none" | "info" | "error" | "question" | "warning";
  title?: string;
  message?: string;
  detail?: string;
  buttons?: string[];
  defaultId?: number;
  cancelId?: number;
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
  storeApiKey: (apiKey: string): Promise<string> =>
    ipcRenderer.invoke("store-api-key", apiKey),
  retrieveApiKey: (encryptedKey: string): Promise<string | null> =>
    ipcRenderer.invoke("retrieve-api-key", encryptedKey),
  fetchS3Logs: (logUrl: string): Promise<AgentEvent[]> =>
    ipcRenderer.invoke("fetch-s3-logs", logUrl),
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
  selectDirectory: (): Promise<string | null> =>
    ipcRenderer.invoke("select-directory"),
  searchDirectories: (query: string, searchRoot?: string): Promise<string[]> =>
    ipcRenderer.invoke("search-directories", query, searchRoot),
  findReposDirectory: (): Promise<string | null> =>
    ipcRenderer.invoke("find-repos-directory"),
  validateRepo: (directoryPath: string): Promise<boolean> =>
    ipcRenderer.invoke("validate-repo", directoryPath),
  checkWriteAccess: (directoryPath: string): Promise<boolean> =>
    ipcRenderer.invoke("check-write-access", directoryPath),
  detectRepo: (
    directoryPath: string,
  ): Promise<{
    organization: string;
    repository: string;
    branch?: string;
    remote?: string;
  } | null> => ipcRenderer.invoke("detect-repo", directoryPath),
  validateRepositoryMatch: (
    path: string,
    organization: string,
    repository: string,
  ): Promise<{
    valid: boolean;
    detected?: { organization: string; repository: string } | null;
    error?: string;
  }> =>
    ipcRenderer.invoke(
      "validate-repository-match",
      path,
      organization,
      repository,
    ),
  checkSSHAccess: (): Promise<{
    available: boolean;
    error?: string;
  }> => ipcRenderer.invoke("check-ssh-access"),
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
  ): (() => void) => {
    const channel = `clone-progress:${cloneId}`;
    const wrapped = (
      _event: IpcRendererEvent,
      payload: {
        status: "cloning" | "complete" | "error";
        message: string;
      },
    ) => listener(payload);
    ipcRenderer.on(channel, wrapped);
    return () => ipcRenderer.removeListener(channel, wrapped);
  },
  showMessageBox: (options: MessageBoxOptions): Promise<{ response: number }> =>
    ipcRenderer.invoke("show-message-box", options),
  openExternal: (url: string): Promise<void> =>
    ipcRenderer.invoke("open-external", url),
  listRepoFiles: (
    repoPath: string,
    query?: string,
  ): Promise<Array<{ path: string; name: string }>> =>
    ipcRenderer.invoke("list-repo-files", repoPath, query),
  clearRepoFileCache: (repoPath: string): Promise<void> =>
    ipcRenderer.invoke("clear-repo-file-cache", repoPath),
  agentStart: async (
    params: AgentStartParams,
  ): Promise<{ sessionId: string; channel: string }> =>
    ipcRenderer.invoke("agent-start", params),
  agentPrompt: async (
    sessionId: string,
    text: string,
  ): Promise<{ stopReason: string }> =>
    ipcRenderer.invoke("agent-prompt", sessionId, text),
  agentCancel: async (sessionId: string): Promise<boolean> =>
    ipcRenderer.invoke("agent-cancel", sessionId),
  agentListSessions: async (
    taskId?: string,
  ): Promise<
    Array<{
      sessionId: string;
      acpSessionId: string;
      channel: string;
      taskId: string;
    }>
  > => ipcRenderer.invoke("agent-list-sessions", taskId),
  agentLoadSession: async (sessionId: string, cwd: string): Promise<boolean> =>
    ipcRenderer.invoke("agent-load-session", sessionId, cwd),
  agentReconnect: async (params: {
    taskId: string;
    taskRunId: string;
    repoPath: string;
    apiKey: string;
    apiHost: string;
    projectId: number;
    logUrl?: string;
  }): Promise<{ sessionId: string; channel: string } | null> =>
    ipcRenderer.invoke("agent-reconnect", params),
  onAgentEvent: (
    channel: string,
    listener: (payload: unknown) => void,
  ): (() => void) => {
    const wrapped = (_event: IpcRendererEvent, payload: unknown) =>
      listener(payload);
    ipcRenderer.on(channel, wrapped);
    return () => ipcRenderer.removeListener(channel, wrapped);
  },
  // Plan mode operations
  agentStartPlanMode: async (params: {
    taskId: string;
    taskTitle: string;
    taskDescription: string;
    repoPath: string;
    apiKey: string;
    apiHost: string;
    projectId: number;
  }): Promise<{ taskId: string; channel: string }> =>
    ipcRenderer.invoke("agent-start-plan-mode", params),
  agentGeneratePlan: async (params: {
    taskId: string;
    taskTitle: string;
    taskDescription: string;
    repoPath: string;
    questionAnswers: unknown[];
    apiKey: string;
    apiHost: string;
    projectId: number;
  }): Promise<{ taskId: string; channel: string }> =>
    ipcRenderer.invoke("agent-generate-plan", params),
  readPlanFile: (repoPath: string, taskId: string): Promise<string | null> =>
    ipcRenderer.invoke("read-plan-file", repoPath, taskId),
  writePlanFile: (
    repoPath: string,
    taskId: string,
    content: string,
  ): Promise<void> =>
    ipcRenderer.invoke("write-plan-file", repoPath, taskId, content),
  ensurePosthogFolder: (repoPath: string, taskId: string): Promise<string> =>
    ipcRenderer.invoke("ensure-posthog-folder", repoPath, taskId),
  listTaskArtifacts: (repoPath: string, taskId: string): Promise<unknown[]> =>
    ipcRenderer.invoke("list-task-artifacts", repoPath, taskId),
  readTaskArtifact: (
    repoPath: string,
    taskId: string,
    fileName: string,
  ): Promise<string | null> =>
    ipcRenderer.invoke("read-task-artifact", repoPath, taskId, fileName),
  appendToArtifact: (
    repoPath: string,
    taskId: string,
    fileName: string,
    content: string,
  ): Promise<void> =>
    ipcRenderer.invoke(
      "append-to-artifact",
      repoPath,
      taskId,
      fileName,
      content,
    ),
  saveQuestionAnswers: (
    repoPath: string,
    taskId: string,
    answers: Array<{
      questionId: string;
      selectedOption: string;
      customInput?: string;
    }>,
  ): Promise<void> =>
    ipcRenderer.invoke("save-question-answers", repoPath, taskId, answers),
  readRepoFile: (repoPath: string, filePath: string): Promise<string | null> =>
    ipcRenderer.invoke("read-repo-file", repoPath, filePath),
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
    listener: (data: { repoPath: string; dirPath: string }) => void,
  ): (() => void) => {
    const wrapped = (
      _event: IpcRendererEvent,
      data: { repoPath: string; dirPath: string },
    ) => listener(data);
    ipcRenderer.on("fs:directory-changed", wrapped);
    return () => ipcRenderer.removeListener("fs:directory-changed", wrapped);
  },
  onFileChanged: (
    listener: (data: { repoPath: string; filePath: string }) => void,
  ): (() => void) => {
    const wrapped = (
      _event: IpcRendererEvent,
      data: { repoPath: string; filePath: string },
    ) => listener(data);
    ipcRenderer.on("fs:file-changed", wrapped);
    return () => ipcRenderer.removeListener("fs:file-changed", wrapped);
  },
  onFileDeleted: (
    listener: (data: { repoPath: string; filePath: string }) => void,
  ): (() => void) => {
    const wrapped = (
      _event: IpcRendererEvent,
      data: { repoPath: string; filePath: string },
    ) => listener(data);
    ipcRenderer.on("fs:file-deleted", wrapped);
    return () => ipcRenderer.removeListener("fs:file-deleted", wrapped);
  },
  onGitStateChanged: (
    listener: (data: { repoPath: string }) => void,
  ): (() => void) => {
    const wrapped = (_event: IpcRendererEvent, data: { repoPath: string }) =>
      listener(data);
    ipcRenderer.on("git:state-changed", wrapped);
    return () => ipcRenderer.removeListener("git:state-changed", wrapped);
  },
  onOpenSettings: (listener: () => void): (() => void) => {
    const wrapped = () => listener();
    ipcRenderer.on("open-settings", wrapped);
    return () => ipcRenderer.removeListener("open-settings", wrapped);
  },
  onNewTask: (listener: () => void): (() => void) => {
    const wrapped = () => listener();
    ipcRenderer.on("new-task", wrapped);
    return () => ipcRenderer.removeListener("new-task", wrapped);
  },
  onResetLayout: (listener: () => void): (() => void) => {
    const wrapped = () => listener();
    ipcRenderer.on("reset-layout", wrapped);
    return () => ipcRenderer.removeListener("reset-layout", wrapped);
  },
  getAppVersion: (): Promise<string> => ipcRenderer.invoke("app:get-version"),
  onUpdateReady: (listener: () => void): (() => void) => {
    const channel = "updates:ready";
    const wrapped = () => listener();
    ipcRenderer.on(channel, wrapped);
    return () => ipcRenderer.removeListener(channel, wrapped);
  },
  installUpdate: (): Promise<{ installed: boolean }> =>
    ipcRenderer.invoke("updates:install"),
  // Shell API
  shellCreate: (sessionId: string, cwd?: string): Promise<void> =>
    ipcRenderer.invoke("shell:create", sessionId, cwd),
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
  ): (() => void) => {
    const channel = `shell:data:${sessionId}`;
    const wrapped = (_event: IpcRendererEvent, data: string) => listener(data);
    ipcRenderer.on(channel, wrapped);
    return () => ipcRenderer.removeListener(channel, wrapped);
  },
  onShellExit: (sessionId: string, listener: () => void): (() => void) => {
    const channel = `shell:exit:${sessionId}`;
    const wrapped = () => listener();
    ipcRenderer.on(channel, wrapped);
    return () => ipcRenderer.removeListener(channel, wrapped);
  },
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
  ): Promise<ExternalAppContextMenuResult> =>
    ipcRenderer.invoke("show-file-context-menu", filePath),
  folders: {
    getFolders: (): Promise<
      Array<{
        id: string;
        path: string;
        name: string;
        lastAccessed: string;
        createdAt: string;
      }>
    > => ipcRenderer.invoke("get-folders"),
    addFolder: (
      folderPath: string,
    ): Promise<{
      id: string;
      path: string;
      name: string;
      lastAccessed: string;
      createdAt: string;
    }> => ipcRenderer.invoke("add-folder", folderPath),
    removeFolder: (folderId: string): Promise<void> =>
      ipcRenderer.invoke("remove-folder", folderId),
    updateFolderAccessed: (folderId: string): Promise<void> =>
      ipcRenderer.invoke("update-folder-accessed", folderId),
    clearAllData: (): Promise<void> => ipcRenderer.invoke("clear-all-data"),
    getTaskAssociations: (): Promise<
      Array<{
        taskId: string;
        folderId: string;
        folderPath: string;
        worktree?: {
          worktreePath: string;
          worktreeName: string;
          branchName: string;
          baseBranch: string;
          createdAt: string;
        };
      }>
    > => ipcRenderer.invoke("get-task-associations"),
    getTaskAssociation: (
      taskId: string,
    ): Promise<{
      taskId: string;
      folderId: string;
      folderPath: string;
      worktree?: {
        worktreePath: string;
        worktreeName: string;
        branchName: string;
        baseBranch: string;
        createdAt: string;
      };
    } | null> => ipcRenderer.invoke("get-task-association", taskId),
    setTaskAssociation: (
      taskId: string,
      folderId: string,
      folderPath: string,
      worktree?: {
        worktreePath: string;
        worktreeName: string;
        branchName: string;
        baseBranch: string;
        createdAt: string;
      },
    ): Promise<{
      taskId: string;
      folderId: string;
      folderPath: string;
      worktree?: {
        worktreePath: string;
        worktreeName: string;
        branchName: string;
        baseBranch: string;
        createdAt: string;
      };
    }> =>
      ipcRenderer.invoke(
        "set-task-association",
        taskId,
        folderId,
        folderPath,
        worktree,
      ),
    updateTaskWorktree: (
      taskId: string,
      worktree: {
        worktreePath: string;
        worktreeName: string;
        branchName: string;
        baseBranch: string;
        createdAt: string;
      },
    ): Promise<{
      taskId: string;
      folderId: string;
      folderPath: string;
      worktree?: {
        worktreePath: string;
        worktreeName: string;
        branchName: string;
        baseBranch: string;
        createdAt: string;
      };
    } | null> => ipcRenderer.invoke("update-task-worktree", taskId, worktree),
    removeTaskAssociation: (taskId: string): Promise<void> =>
      ipcRenderer.invoke("remove-task-association", taskId),
    clearTaskWorktree: (taskId: string): Promise<void> =>
      ipcRenderer.invoke("clear-task-worktree", taskId),
    cleanupOrphanedWorktrees: (
      mainRepoPath: string,
    ): Promise<{
      deleted: string[];
      errors: Array<{ path: string; error: string }>;
    }> => ipcRenderer.invoke("cleanup-orphaned-worktrees", mainRepoPath),
  },
  // Worktree API
  worktree: {
    create: (
      mainRepoPath: string,
    ): Promise<{
      worktreePath: string;
      worktreeName: string;
      branchName: string;
      baseBranch: string;
      createdAt: string;
    }> => ipcRenderer.invoke("worktree-create", mainRepoPath),
    delete: (mainRepoPath: string, worktreePath: string): Promise<void> =>
      ipcRenderer.invoke("worktree-delete", mainRepoPath, worktreePath),
    getInfo: (
      mainRepoPath: string,
      worktreePath: string,
    ): Promise<{
      worktreePath: string;
      worktreeName: string;
      branchName: string;
      baseBranch: string;
      createdAt: string;
    } | null> =>
      ipcRenderer.invoke("worktree-get-info", mainRepoPath, worktreePath),
    exists: (mainRepoPath: string, name: string): Promise<boolean> =>
      ipcRenderer.invoke("worktree-exists", mainRepoPath, name),
    list: (
      mainRepoPath: string,
    ): Promise<
      Array<{
        worktreePath: string;
        worktreeName: string;
        branchName: string;
        baseBranch: string;
        createdAt: string;
      }>
    > => ipcRenderer.invoke("worktree-list", mainRepoPath),
    isWorktree: (mainRepoPath: string, repoPath: string): Promise<boolean> =>
      ipcRenderer.invoke("worktree-is-worktree", mainRepoPath, repoPath),
    getMainRepoPath: (
      mainRepoPath: string,
      worktreePath: string,
    ): Promise<string | null> =>
      ipcRenderer.invoke("worktree-get-main-repo", mainRepoPath, worktreePath),
  },
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
});
