/**
 * PostHog-specific ACP extensions.
 *
 * These follow the ACP extensibility model:
 * - Custom notification methods are prefixed with `_posthog/`
 * - Custom data can be attached via `_meta` fields
 *
 * See: https://agentclientprotocol.com/docs/extensibility
 */

/**
 * Custom notification methods for PostHog-specific events.
 * Used with AgentSideConnection.extNotification() or Client.extNotification()
 */
export const POSTHOG_NOTIFICATIONS = {
  /** Git branch was created */
  BRANCH_CREATED: "_posthog/branch_created",
  /** Task run has started */
  RUN_STARTED: "_posthog/run_started",
  /** Task has completed */
  TASK_COMPLETE: "_posthog/task_complete",
  /** Error occurred during task execution */
  ERROR: "_posthog/error",
  /** Console/log output */
  CONSOLE: "_posthog/console",
  /** SDK session ID notification (for resumption) */
  SDK_SESSION: "_posthog/sdk_session",
  /** Tree state snapshot captured */
  TREE_SNAPSHOT: "_posthog/tree_snapshot",
  /** Agent mode changed (interactive/background) */
  MODE_CHANGE: "_posthog/mode_change",
  /** File sync event (legacy, deprecated) */
  FILE_SYNC: "_posthog/file_sync",
} as const;

export type PostHogNotificationType =
  (typeof POSTHOG_NOTIFICATIONS)[keyof typeof POSTHOG_NOTIFICATIONS];

export interface BranchCreatedPayload {
  branch: string;
}

export interface RunStartedPayload {
  sessionId: string;
  runId: string;
  taskId?: string;
}

/**
 * Payload for task complete notification
 */
export interface TaskCompletePayload {
  sessionId: string;
  taskId: string;
}

export interface ErrorNotificationPayload {
  sessionId: string;
  message: string;
  error?: unknown;
}

/**
 * Console output for a session
 */
export interface ConsoleNotificationPayload {
  sessionId: string;
  level: "debug" | "info" | "warn" | "error";
  message: string;
}

/**
 * Maps a session ID to a SDKs session ID
 */
export interface SdkSessionPayload {
  sessionId: string;
  sdkSessionId: string;
}

/**
 * Tree state snapshot event payload
 */
export interface TreeSnapshotPayload {
  treeHash: string;
  baseCommit: string | null;
  archiveUrl?: string;
  filesChanged: string[];
  timestamp: string;
  interrupted?: boolean;
  device?: {
    id: string;
    type: "local" | "cloud";
    name?: string;
  };
}

/**
 * Agent mode change event payload
 */
export interface ModeChangePayload {
  mode: "interactive" | "background";
  previous_mode: "interactive" | "background";
}

export type PostHogNotificationPayload =
  | BranchCreatedPayload
  | RunStartedPayload
  | TaskCompletePayload
  | ErrorNotificationPayload
  | ConsoleNotificationPayload
  | SdkSessionPayload
  | TreeSnapshotPayload
  | ModeChangePayload;
