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
  /** Artifact produced during task execution (research, plan, etc.) */
  ARTIFACT: "_posthog/artifact",
  /** Phase has started (research, plan, build, etc.) */
  PHASE_START: "_posthog/phase_start",
  /** Phase has completed */
  PHASE_COMPLETE: "_posthog/phase_complete",
  /** Git branch was created */
  BRANCH_CREATED: "_posthog/branch_created",
  /** Pull request was created */
  PR_CREATED: "_posthog/pr_created",
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
} as const;

export type PostHogNotificationType =
  (typeof POSTHOG_NOTIFICATIONS)[keyof typeof POSTHOG_NOTIFICATIONS];

export interface ArtifactNotificationPayload {
  sessionId: string;
  kind:
    | "research_evaluation"
    | "research_questions"
    | "plan"
    | "pr_body"
    | string;
  content: unknown;
}

export interface PhaseNotificationPayload {
  sessionId: string;
  phase: "research" | "plan" | "build" | "finalize" | string;
  [key: string]: unknown;
}

export interface BranchCreatedPayload {
  sessionId: string;
  branch: string;
}

/**
 * Payload for PR created notification
 */
export interface PrCreatedPayload {
  sessionId: string;
  prUrl: string;
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

export type PostHogNotificationPayload =
  | ArtifactNotificationPayload
  | PhaseNotificationPayload
  | BranchCreatedPayload
  | PrCreatedPayload
  | RunStartedPayload
  | TaskCompletePayload
  | ErrorNotificationPayload
  | ConsoleNotificationPayload
  | SdkSessionPayload;
