import type { ContentBlock } from "@agentclientprotocol/sdk";
import "@main/services/types";

declare global {
  interface IElectronAPI {
    agentStart: (params: {
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
    }) => Promise<{ sessionId: string; channel: string }>;
    agentPrompt: (
      sessionId: string,
      prompt: ContentBlock[],
    ) => Promise<{ stopReason: string }>;
    agentCancel: (sessionId: string) => Promise<boolean>;
    agentCancelPrompt: (sessionId: string) => Promise<boolean>;
    agentReconnect: (params: {
      taskId: string;
      taskRunId: string;
      repoPath: string;
      apiKey: string;
      apiHost: string;
      projectId: number;
      logUrl?: string;
      sdkSessionId?: string;
    }) => Promise<{ sessionId: string; channel: string } | null>;
    agentTokenRefresh: (taskRunId: string, newToken: string) => Promise<void>;
    agentSetModel: (sessionId: string, modelId: string) => Promise<void>;
    onAgentEvent: (
      channel: string,
      listener: (event: unknown) => void,
    ) => () => void;
    onOpenSettings: (listener: () => void) => () => void;
    onNewTask: (listener: () => void) => () => void;
    onResetLayout: (listener: () => void) => () => void;
    onClearStorage: (listener: () => void) => () => void;
    getAppVersion: () => Promise<string>;
  }

  interface Window {
    electronAPI: IElectronAPI;
  }
}
