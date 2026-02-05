import type {
  SessionConfigOption,
  SessionConfigSelectGroup,
  SessionConfigSelectOption,
  SessionConfigSelectOptions,
} from "@agentclientprotocol/sdk";
import type { ExecutionMode } from "@shared/types";
import type { AcpMessage } from "@shared/types/session-events";
import { create } from "zustand";
import { immer } from "zustand/middleware/immer";
import type { PermissionRequest } from "../utils/parseSessionLogs";

// --- Types ---

/** Adapter type for different agent backends */
export type Adapter = "claude" | "codex";

export interface QueuedMessage {
  id: string;
  content: string;
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
  isCloud: boolean;
  logUrl?: string;
  processedLineCount?: number;
  framework?: "claude";
  /** Agent adapter type (e.g., "claude" or "codex") */
  adapter?: Adapter;
  /** Session configuration options (model, mode, thought level, etc.) */
  configOptions?: SessionConfigOption[];
  pendingPermissions: Map<string, PermissionRequest>;
  messageQueue: QueuedMessage[];
}

// --- Config Option Helpers ---

/**
 * Type guard to check if options array contains groups (vs flat options).
 */
export function isSelectGroup(
  options: SessionConfigSelectOptions,
): options is SessionConfigSelectGroup[] {
  return (
    options.length > 0 &&
    typeof options[0] === "object" &&
    "options" in options[0]
  );
}

/**
 * Flatten grouped select options into a flat array.
 */
export function flattenSelectOptions(
  options: SessionConfigSelectOptions,
): SessionConfigSelectOption[] {
  if (!options.length) return [];
  if (isSelectGroup(options)) {
    return options.flatMap((group) => group.options);
  }
  return options as SessionConfigSelectOption[];
}

/**
 * Merge live configOptions from server with persisted values.
 * Persisted values take precedence for currentValue.
 */
export function mergeConfigOptions(
  live: SessionConfigOption[],
  persisted: SessionConfigOption[],
): SessionConfigOption[] {
  const persistedMap = new Map(persisted.map((opt) => [opt.id, opt]));

  return live.map((liveOpt) => {
    const persistedOpt = persistedMap.get(liveOpt.id);
    if (persistedOpt) {
      // Use persisted currentValue if available
      return { ...liveOpt, currentValue: persistedOpt.currentValue };
    }
    return liveOpt;
  });
}

/**
 * Get a config option by its category (e.g., "mode", "model", "thought_level").
 */
export function getConfigOptionByCategory(
  configOptions: SessionConfigOption[] | undefined,
  category: string,
): SessionConfigOption | undefined {
  return configOptions?.find((opt) => opt.category === category);
}

/**
 * Cycle to the next mode option value.
 * Returns the next value, or undefined if cycling is not possible.
 */
export function cycleModeOption(
  modeOption: SessionConfigOption | undefined,
  allowBypassPermissions: boolean,
): string | undefined {
  if (!modeOption) return undefined;

  const allOptions = flattenSelectOptions(modeOption.options);
  const filteredOptions = allowBypassPermissions
    ? allOptions
    : allOptions.filter(
        (opt) =>
          opt.value !== "bypassPermissions" && opt.value !== "full-access",
      );

  if (filteredOptions.length === 0) return allOptions[0]?.value;

  const currentIndex = filteredOptions.findIndex(
    (opt) => opt.value === modeOption.currentValue,
  );
  if (currentIndex === -1) return filteredOptions[0]?.value;

  const nextIndex = (currentIndex + 1) % filteredOptions.length;
  return filteredOptions[nextIndex]?.value;
}

/**
 * Get the current mode from configOptions (for backwards compatibility).
 * Returns the currentValue of the "mode" category config option.
 */
export function getCurrentModeFromConfigOptions(
  configOptions: SessionConfigOption[] | undefined,
): ExecutionMode | undefined {
  const modeOption = getConfigOptionByCategory(configOptions, "mode");
  return modeOption?.currentValue as ExecutionMode | undefined;
}

export interface SessionState {
  /** Sessions indexed by taskRunId */
  sessions: Record<string, AgentSession>;
  /** Index mapping taskId -> taskRunId for O(1) lookups */
  taskIdIndex: Record<string, string>;
}

// --- Store ---

export const useSessionStore = create<SessionState>()(
  immer(() => ({
    sessions: {},
    taskIdIndex: {},
  })),
);

// --- Re-exports ---

export type { PermissionRequest, ExecutionMode, SessionConfigOption };
export { cycleExecutionMode, getExecutionModes } from "@utils/session";
export {
  getAvailableCommandsForTask,
  getPendingPermissionsForTask,
  getUserPromptsForTask,
  useAdapterForTask,
  useAvailableCommandsForTask,
  useConfigOptionForTask,
  useModeConfigOptionForTask,
  useModelConfigOptionForTask,
  usePendingPermissionsForTask,
  useQueuedMessagesForTask,
  useSessionForTask,
  useSessions,
  useThoughtLevelConfigOptionForTask,
} from "../hooks/useSession";

// --- Setters ---

export const sessionStoreSetters = {
  setSession: (session: AgentSession) => {
    useSessionStore.setState((state) => {
      // Clean up old session if taskId already has a different taskRunId
      const existingTaskRunId = state.taskIdIndex[session.taskId];
      if (existingTaskRunId && existingTaskRunId !== session.taskRunId) {
        delete state.sessions[existingTaskRunId];
      }

      state.sessions[session.taskRunId] = session;
      state.taskIdIndex[session.taskId] = session.taskRunId;
    });
  },

  removeSession: (taskRunId: string) => {
    useSessionStore.setState((state) => {
      const session = state.sessions[taskRunId];
      if (session) {
        delete state.taskIdIndex[session.taskId];
      }
      delete state.sessions[taskRunId];
    });
  },

  updateSession: (taskRunId: string, updates: Partial<AgentSession>) => {
    useSessionStore.setState((state) => {
      if (state.sessions[taskRunId]) {
        Object.assign(state.sessions[taskRunId], updates);
      }
    });
  },

  appendEvents: (
    taskRunId: string,
    events: AcpMessage[],
    newLineCount?: number,
  ) => {
    useSessionStore.setState((state) => {
      const session = state.sessions[taskRunId];
      if (session) {
        session.events.push(...events);
        if (newLineCount !== undefined) {
          session.processedLineCount = newLineCount;
        }
      }
    });
  },

  setPendingPermissions: (
    taskRunId: string,
    permissions: Map<string, PermissionRequest>,
  ) => {
    useSessionStore.setState((state) => {
      if (state.sessions[taskRunId]) {
        state.sessions[taskRunId].pendingPermissions = permissions;
      }
    });
  },

  enqueueMessage: (taskRunId: string, content: string) => {
    const id = `queue-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    useSessionStore.setState((state) => {
      const session = state.sessions[taskRunId];
      if (session) {
        session.messageQueue.push({ id, content, queuedAt: Date.now() });
      }
    });
  },

  clearMessageQueue: (taskRunId: string) => {
    useSessionStore.setState((state) => {
      const session = state.sessions[taskRunId];
      if (session) {
        session.messageQueue = [];
      }
    });
  },

  popQueuedMessagesAsText: (taskId: string): string | null => {
    let result: string | null = null;
    useSessionStore.setState((state) => {
      const taskRunId = state.taskIdIndex[taskId];
      if (!taskRunId) return;

      const session = state.sessions[taskRunId];
      if (!session || session.messageQueue.length === 0) return;

      result = session.messageQueue.map((msg) => msg.content).join("\n\n");
      session.messageQueue = [];
    });
    return result;
  },

  /** O(1) lookup using taskIdIndex */
  getSessionByTaskId: (taskId: string): AgentSession | undefined => {
    const state = useSessionStore.getState();
    const taskRunId = state.taskIdIndex[taskId];
    if (!taskRunId) return undefined;
    return state.sessions[taskRunId];
  },

  getSessions: (): Record<string, AgentSession> => {
    return useSessionStore.getState().sessions;
  },
};
