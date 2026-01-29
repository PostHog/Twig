/**
 * PostHog-specific ACP extensions.
 *
 * These follow the ACP extensibility model:
 * - Custom notification methods are prefixed with `_posthog/`
 * - Custom data can be attached via `_meta` fields
 *
 * Note: When using `extNotification()` from the ACP SDK, it automatically
 * adds an extra underscore prefix (e.g., `_posthog/tree_snapshot` becomes
 * `__posthog/tree_snapshot` in the log). Code that reads logs should handle both.
 *
 * See: https://agentclientprotocol.com/docs/extensibility
 */

/**
 * Custom notification methods for PostHog-specific events.
 * Used with AgentSideConnection.extNotification() or Client.extNotification()
 */
export const POSTHOG_NOTIFICATIONS = {
  /** Git branch was created for a task */
  BRANCH_CREATED: "_posthog/branch_created",

  /** Task run has started execution */
  RUN_STARTED: "_posthog/run_started",

  /** Task has completed (success or failure) */
  TASK_COMPLETE: "_posthog/task_complete",

  /** Error occurred during task execution */
  ERROR: "_posthog/error",

  /** Console/log output from the agent */
  CONSOLE: "_posthog/console",

  /** Maps a session ID to the underlying SDK session ID (for resumption) */
  SDK_SESSION: "_posthog/sdk_session",

  /** Tree state snapshot captured (git tree hash + file archive) */
  TREE_SNAPSHOT: "_posthog/tree_snapshot",

  /** Agent mode changed (interactive/background) */
  MODE_CHANGE: "_posthog/mode_change",

  /** Request to resume a session from previous state */
  SESSION_RESUME: "_posthog/session/resume",

  /** User message sent from client to agent */
  USER_MESSAGE: "_posthog/user_message",

  /** Request to cancel current operation */
  CANCEL: "_posthog/cancel",

  /** Request to close the session */
  CLOSE: "_posthog/close",

  /** Agent status update (thinking, working, etc.) */
  STATUS: "_posthog/status",

  /** Task-level notification (progress, milestones) */
  TASK_NOTIFICATION: "_posthog/task_notification",

  /** Marks a boundary for log compaction */
  COMPACT_BOUNDARY: "_posthog/compact_boundary",
} as const;

export type PostHogNotificationType =
  (typeof POSTHOG_NOTIFICATIONS)[keyof typeof POSTHOG_NOTIFICATIONS];

// --- Payload types for each notification ---

export interface BranchCreatedPayload {
  branch: string;
}

export interface RunStartedPayload {
  sessionId: string;
  runId: string;
  taskId?: string;
}

export interface TaskCompletePayload {
  sessionId: string;
  taskId: string;
}

export interface ErrorNotificationPayload {
  sessionId: string;
  message: string;
  error?: unknown;
}

export interface ConsoleNotificationPayload {
  sessionId: string;
  level: "debug" | "info" | "warn" | "error";
  message: string;
}

export interface SdkSessionPayload {
  sessionId: string;
  sdkSessionId: string;
}

export interface TreeSnapshotPayload {
  treeHash: string;
  baseCommit: string | null;
  archiveUrl?: string;
  filesChanged: string[];
  filesDeleted?: string[];
  timestamp: string;
  interrupted?: boolean;
  device?: {
    type: "local" | "cloud";
    name?: string;
  };
}

export interface ModeChangePayload {
  mode: "interactive" | "background";
  previous_mode: "interactive" | "background";
}

export interface SessionResumePayload {
  sessionId: string;
  fromSnapshot?: string;
}

export interface UserMessagePayload {
  content: string;
}

export interface StatusPayload {
  sessionId: string;
  status: string;
  message?: string;
}

export interface TaskNotificationPayload {
  sessionId: string;
  type: string;
  message?: string;
  data?: Record<string, unknown>;
}

export interface CompactBoundaryPayload {
  sessionId: string;
  timestamp: string;
}

export type PostHogNotificationPayload =
  | BranchCreatedPayload
  | RunStartedPayload
  | TaskCompletePayload
  | ErrorNotificationPayload
  | ConsoleNotificationPayload
  | SdkSessionPayload
  | TreeSnapshotPayload
  | ModeChangePayload
  | SessionResumePayload
  | UserMessagePayload
  | StatusPayload
  | TaskNotificationPayload
  | CompactBoundaryPayload;
