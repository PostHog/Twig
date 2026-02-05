import type {
  ContentBlock,
  RequestPermissionRequest,
  RequestPermissionResponse,
} from "@agentclientprotocol/sdk";
import type { AcpMessage } from "../../../../shared/types/session-events.js";
import type { PromptOutput } from "../schemas.js";

export interface TransportConfig {
  taskId: string;
  taskRunId: string;
  repoPath: string;
  model?: string;
  executionMode?: string;
  additionalDirectories?: string[];
}

export interface LocalTransportConfig extends TransportConfig {
  type: "local";
  credentials: {
    apiKey: string;
    apiHost: string;
    projectId: number;
  };
  logUrl?: string;
  sdkSessionId?: string;
}

export interface CloudTransportConfig extends TransportConfig {
  type: "cloud";
  sandboxUrl: string;
  connectionToken: string;
}

export type AnyTransportConfig = LocalTransportConfig | CloudTransportConfig;

export interface TransportEvents {
  message: (msg: AcpMessage) => void;
  permission: (req: RequestPermissionRequest) => void;
  error: (err: Error) => void;
  close: () => void;
}

export interface ModelInfo {
  modelId: string;
  name: string;
  description?: string | null;
}

export interface ConnectResult {
  availableModels?: ModelInfo[];
  currentModelId?: string;
}

export interface AgentTransport {
  readonly sessionId: string;

  connect(isReconnect: boolean): Promise<ConnectResult>;

  disconnect(): Promise<void>;

  sendPrompt(prompt: ContentBlock[]): Promise<PromptOutput>;

  cancelPrompt(): Promise<void>;

  setModel(modelId: string): Promise<void>;

  setMode(modeId: string): Promise<void>;

  respondToPermission(
    toolCallId: string,
    response: RequestPermissionResponse,
  ): void;

  on<K extends keyof TransportEvents>(
    event: K,
    handler: TransportEvents[K],
  ): void;

  off<K extends keyof TransportEvents>(
    event: K,
    handler: TransportEvents[K],
  ): void;
}
