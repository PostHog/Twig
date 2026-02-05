import type { ExecutionMode } from "@shared/types";
import type { AcpMessage } from "@shared/types/session-events";
import { create } from "zustand";
import { immer } from "zustand/middleware/immer";
import type { PermissionRequest } from "../utils/parseSessionLogs";

export interface AgentModelOption {
  modelId: string;
  name: string;
  description?: string | null;
  provider?: string;
}

export interface QueuedMessage {
  id: string;
  content: string;
  queuedAt: number;
}

export interface AgentSession {
  taskRunId: string;
  taskId: string;
  taskTitle: string;
  channel: string;
  events: AcpMessage[];
  startedAt: number;
  status: "connecting" | "connected" | "disconnected" | "error";
  errorMessage?: string;
  isPromptPending: boolean;
  promptStartedAt: number | null;
  logUrl?: string;
  processedLineCount?: number;
  model?: string;
  availableModels?: AgentModelOption[];
  framework?: "claude";
  currentMode: ExecutionMode;
  pendingPermissions: Map<string, PermissionRequest>;
  messageQueue: QueuedMessage[];
}

export interface SessionState {
  sessions: Record<string, AgentSession>;
}

export const useSessionStore = create<SessionState>()(
  immer(() => ({
    sessions: {},
  })),
);
