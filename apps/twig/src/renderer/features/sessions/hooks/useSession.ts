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
} from "../stores/sessionStoreCore";
import type { PermissionRequest } from "../utils/parseSessionLogs";

export const useSessions = () => useSessionStore((s) => s.sessions);

export const useSessionForTask = (
  taskId: string | undefined,
): AgentSession | undefined =>
  useSessionStore((s) =>
    taskId
      ? Object.values(s.sessions).find((session) => session.taskId === taskId)
      : undefined,
  );

export const useAvailableCommandsForTask = (
  taskId: string | undefined,
): AvailableCommand[] => {
  return useSessionStore((s) => {
    if (!taskId) return [];
    const session = Object.values(s.sessions).find(
      (sess) => sess.taskId === taskId,
    );
    if (!session?.events) return [];
    return extractAvailableCommandsFromEvents(session.events);
  });
};

export function getAvailableCommandsForTask(
  taskId: string | undefined,
): AvailableCommand[] {
  if (!taskId) return [];
  const sessions = useSessionStore.getState().sessions;
  const session = Object.values(sessions).find(
    (sess) => sess.taskId === taskId,
  );
  if (!session?.events) return [];
  return extractAvailableCommandsFromEvents(session.events);
}

export function getUserPromptsForTask(taskId: string | undefined): string[] {
  if (!taskId) return [];
  const sessions = useSessionStore.getState().sessions;
  const session = Object.values(sessions).find(
    (sess) => sess.taskId === taskId,
  );
  if (!session?.events) return [];
  return extractUserPromptsFromEvents(session.events);
}

export const usePendingPermissionsForTask = (
  taskId: string | undefined,
): Map<string, PermissionRequest> => {
  return useSessionStore((s) => {
    if (!taskId) return new Map();
    const session = Object.values(s.sessions).find(
      (sess) => sess.taskId === taskId,
    );
    return session?.pendingPermissions ?? new Map();
  });
};

export function getPendingPermissionsForTask(
  taskId: string | undefined,
): Map<string, PermissionRequest> {
  if (!taskId) return new Map();
  const sessions = useSessionStore.getState().sessions;
  const session = Object.values(sessions).find(
    (sess) => sess.taskId === taskId,
  );
  return session?.pendingPermissions ?? new Map();
}

// Uses taskRunId lookup via separate selector to ensure proper updates
export const useCurrentModeForTask = (
  taskId: string | undefined,
): ExecutionMode | undefined => {
  const taskRunId = useSessionStore((s) => {
    if (!taskId) return undefined;
    for (const session of Object.values(s.sessions)) {
      if (session.taskId === taskId) {
        return session.taskRunId;
      }
    }
    return undefined;
  });

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
    const session = Object.values(s.sessions).find(
      (sess) => sess.taskId === taskId,
    );
    return session?.messageQueue ?? [];
  });
};
