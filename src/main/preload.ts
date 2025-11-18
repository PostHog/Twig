import { contextBridge, type IpcRendererEvent, ipcRenderer } from "electron";
import type {
  CloudRegion,
  OAuthTokenResponse,
  StoredOAuthTokens,
} from "../shared/types/oauth";

interface MessageBoxOptions {
  type?: "info" | "error" | "warning" | "question";
  title?: string;
  message?: string;
  detail?: string;
  buttons?: string[];
  defaultId?: number;
  cancelId?: number;
}

interface AgentStartParams {
  taskId: string;
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
  // OAuth API
  oauthStartFlow: (
    region: CloudRegion,
  ): Promise<{ success: boolean; data?: OAuthTokenResponse; error?: string }> =>
    ipcRenderer.invoke("oauth:start-flow", region),
  oauthEncryptTokens: (
    tokens: StoredOAuthTokens,
  ): Promise<{ success: boolean; encrypted?: string; error?: string }> =>
    ipcRenderer.invoke("oauth:encrypt-tokens", tokens),
  oauthRetrieveTokens: (
    encrypted: string,
  ): Promise<{ success: boolean; data?: StoredOAuthTokens; error?: string }> =>
    ipcRenderer.invoke("oauth:retrieve-tokens", encrypted),
  oauthDeleteTokens: (): Promise<{ success: boolean }> =>
    ipcRenderer.invoke("oauth:delete-tokens"),
  oauthRefreshToken: (
    refreshToken: string,
    region: CloudRegion,
  ): Promise<{ success: boolean; data?: OAuthTokenResponse; error?: string }> =>
    ipcRenderer.invoke("oauth:refresh-token", refreshToken, region),
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
  agentStart: async (
    params: AgentStartParams,
  ): Promise<{ taskId: string; channel: string }> =>
    ipcRenderer.invoke("agent-start", params),
  agentCancel: async (taskId: string): Promise<boolean> =>
    ipcRenderer.invoke("agent-cancel", taskId),
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
  onOpenSettings: (listener: () => void): (() => void) => {
    const wrapped = () => listener();
    ipcRenderer.on("open-settings", wrapped);
    return () => ipcRenderer.removeListener("open-settings", wrapped);
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
  shellDestroy: (sessionId: string): Promise<void> =>
    ipcRenderer.invoke("shell:destroy", sessionId),
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
});
