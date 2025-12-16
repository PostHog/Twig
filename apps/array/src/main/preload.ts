import type { ContentBlock } from "@agentclientprotocol/sdk";
import { contextBridge, type IpcRendererEvent, ipcRenderer } from "electron";
import { exposeElectronTRPC } from "trpc-electron/main";
import type {
  CreateWorkspaceOptions,
  ScriptExecutionResult,
  Workspace,
  WorkspaceInfo,
  WorkspaceTerminalInfo,
} from "../shared/types";
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
  // Repo API
  validateRepo: (directoryPath: string): Promise<boolean> =>
    ipcRenderer.invoke("validate-repo", directoryPath),
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
  // Git operations
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
});
