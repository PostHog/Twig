import type { AvailableCommand } from "@agentclientprotocol/sdk";
import type { ExecutionMode } from "@shared/types";
import {
  extractAvailableCommandsFromEvents,
  extractUserPromptsFromEvents,
} from "@utils/session";
import {
  type AgentSession,
  type QueuedMessage,
  useSessionStore,
} from "../stores/sessionStore";
import type { PermissionRequest } from "../utils/parseSessionLogs";

export const useSessions = () => useSessionStore((s) => s.sessions);

/** O(1) lookup using taskIdIndex */
export const useSessionForTask = (
  taskId: string | undefined,
): AgentSession | undefined =>
  useSessionStore((s) => {
    if (!taskId) return undefined;
    const taskRunId = s.taskIdIndex[taskId];
    if (!taskRunId) return undefined;
    return s.sessions[taskRunId];
  });

export const useAvailableCommandsForTask = (
  taskId: string | undefined,
): AvailableCommand[] => {
  return useSessionStore((s) => {
    if (!taskId) return [];
    const taskRunId = s.taskIdIndex[taskId];
    if (!taskRunId) return [];
    const session = s.sessions[taskRunId];
    if (!session?.events) return [];
    return extractAvailableCommandsFromEvents(session.events);
  });
};

export function getAvailableCommandsForTask(
  taskId: string | undefined,
): AvailableCommand[] {
  if (!taskId) return [];
  const state = useSessionStore.getState();
  const taskRunId = state.taskIdIndex[taskId];
  if (!taskRunId) return [];
  const session = state.sessions[taskRunId];
  if (!session?.events) return [];
  return extractAvailableCommandsFromEvents(session.events);
}

export function getUserPromptsForTask(taskId: string | undefined): string[] {
  if (!taskId) return [];
  const state = useSessionStore.getState();
  const taskRunId = state.taskIdIndex[taskId];
  if (!taskRunId) return [];
  const session = state.sessions[taskRunId];
  if (!session?.events) return [];
  return extractUserPromptsFromEvents(session.events);
}

export const usePendingPermissionsForTask = (
  taskId: string | undefined,
): Map<string, PermissionRequest> => {
  return useSessionStore((s) => {
    if (!taskId) return new Map();
    const taskRunId = s.taskIdIndex[taskId];
    if (!taskRunId) return new Map();
    const session = s.sessions[taskRunId];
    return session?.pendingPermissions ?? new Map();
  });
};

export function getPendingPermissionsForTask(
  taskId: string | undefined,
): Map<string, PermissionRequest> {
  if (!taskId) return new Map();
  const state = useSessionStore.getState();
  const taskRunId = state.taskIdIndex[taskId];
  if (!taskRunId) return new Map();
  const session = state.sessions[taskRunId];
  return session?.pendingPermissions ?? new Map();
}

/** O(1) lookup using taskIdIndex */
export const useCurrentModeForTask = (
  taskId: string | undefined,
): ExecutionMode | undefined => {
  const taskRunId = useSessionStore((s) =>
    taskId ? s.taskIdIndex[taskId] : undefined,
  );

  return useSessionStore((s) => {
    if (!taskRunId) return undefined;
    return s.sessions[taskRunId]?.currentMode;
  });
};

export const useQueuedMessagesForTask = (
  taskId: string | undefined,
): QueuedMessage[] => {
  return useSessionStore((s) => {
    if (!taskId) return [];
    const taskRunId = s.taskIdIndex[taskId];
    if (!taskRunId) return [];
    const session = s.sessions[taskRunId];
    return session?.messageQueue ?? [];
  });
};
