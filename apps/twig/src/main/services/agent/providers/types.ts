import type { ContentBlock } from "@agentclientprotocol/sdk";
import type { AcpMessage } from "@shared/types/session-events";
import type {
  InterruptReason,
  PermissionRequestPayload,
  PromptOutput,
  SessionConfig,
} from "../schemas.js";

export interface SessionCapabilities {
  supportsModelSwitch: boolean;
  supportsModeSwitch: boolean;
  supportsGitStatus: boolean;
  supportsTerminal: boolean;
  supportsReconnect: boolean;
}

export interface SessionStatus {
  executionEnvironment: "local" | "cloud";
  isTransitioning: boolean;
  capabilities: SessionCapabilities;
}

export interface SessionProvider {
  readonly capabilities: SessionCapabilities;
  readonly executionEnvironment: "local" | "cloud";

  connect(config: SessionConfig, isReconnect: boolean): Promise<void>;
  disconnect(): Promise<void>;
  prompt(blocks: ContentBlock[]): Promise<PromptOutput>;
  cancelPrompt(reason?: InterruptReason): Promise<boolean>;

  setModel?(modelId: string): Promise<void>;
  setMode?(modeId: string): Promise<void>;

  onEvent(handler: (event: AcpMessage) => void): () => void;
  onPermission(
    handler: (request: Omit<PermissionRequestPayload, "sessionId">) => void,
  ): () => void;

  cleanup(): Promise<void>;
}

export const LOCAL_CAPABILITIES: SessionCapabilities = {
  supportsModelSwitch: true,
  supportsModeSwitch: true,
  supportsGitStatus: true,
  supportsTerminal: true,
  supportsReconnect: true,
};

export const CLOUD_CAPABILITIES: SessionCapabilities = {
  supportsModelSwitch: false,
  supportsModeSwitch: false,
  supportsGitStatus: false,
  supportsTerminal: false,
  supportsReconnect: false,
};
