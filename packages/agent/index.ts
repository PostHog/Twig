export type {
  BranchCreatedPayload,
  ConsoleNotificationPayload,
  ErrorNotificationPayload,
  ModeChangePayload,
  PostHogNotificationPayload,
  PostHogNotificationType,
  RunStartedPayload,
  SdkSessionPayload,
  TaskCompletePayload,
  TreeSnapshotPayload,
} from "./src/acp-extensions.js";
export { POSTHOG_NOTIFICATIONS } from "./src/acp-extensions.js";
export type {
  AcpConnectionConfig,
  InProcessAcpConnection,
} from "./src/adapters/acp-connection.js";
export { createAcpConnection } from "./src/adapters/acp-connection.js";
export type {
  CloudConnectionConfig,
  CloudConnectionEvents,
  JsonRpcMessage,
} from "./src/adapters/cloud-connection.js";
export { CloudConnection } from "./src/adapters/cloud-connection.js";

// @deprecated - Use TreeTracker instead for state sync
export type {
  FileChangeEvent,
  FileSyncConfig,
  SyncedFile,
} from "./src/file-sync.js";
// @deprecated - Use TreeTracker instead for state sync
export { FileSyncManager } from "./src/file-sync.js";
export type {
  AgentConfig,
  AgentMode,
  DeviceInfo,
  FileManifest,
  FileManifestEntry,
  LogLevel,
  OnLogCallback,
  StoredEntry,
  StoredNotification,
  Task,
  TaskRun,
  TreeSnapshotEvent,
  WorktreeInfo,
} from "./src/types.js";

export type { TreeSnapshot, TreeTrackerConfig } from "./src/tree-tracker.js";
export { TreeTracker } from "./src/tree-tracker.js";

export type {
  ConversationTurn,
  ResumeConfig,
  ResumeState,
  ToolCallInfo,
} from "./src/resume.js";
export { conversationToPromptHistory, resumeFromLog } from "./src/resume.js";

export { getLlmGatewayUrl } from "./src/utils/gateway.js";
export type { LoggerConfig } from "./src/utils/logger.js";
export { Logger } from "./src/utils/logger.js";

export { Agent } from "./src/agent.js";
export { PostHogAPIClient } from "./src/posthog-api.js";

export type { WorktreeConfig } from "./src/worktree-manager.js";
export { WorktreeManager } from "./src/worktree-manager.js";
