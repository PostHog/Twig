import type { ContentBlock } from "@agentclientprotocol/sdk";
import { contextBridge, type IpcRendererEvent, ipcRenderer } from "electron";
import { exposeElectronTRPC } from "trpc-electron/main";
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
  onOpenSettings: (listener: () => void): (() => void) =>
    createVoidIpcListener("open-settings", listener),
  onNewTask: (listener: () => void): (() => void) =>
    createVoidIpcListener("new-task", listener),
  onResetLayout: (listener: () => void): (() => void) =>
    createVoidIpcListener("reset-layout", listener),
  onClearStorage: (listener: () => void): (() => void) =>
    createVoidIpcListener("clear-storage", listener),
  getAppVersion: (): Promise<string> => ipcRenderer.invoke("app:get-version"),
});
