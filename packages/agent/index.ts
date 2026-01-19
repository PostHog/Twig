export { Agent } from "./src/agent.js";
export { getLlmGatewayUrl, PostHogAPIClient } from "./src/posthog-api.js";
export type {
  CloudConnectionConfig,
  CloudConnectionEvents,
  FileSyncEvent,
  JsonRpcMessage,
} from "./src/adapters/cloud-connection.js";
export { CloudConnection } from "./src/adapters/cloud-connection.js";
export type { FileChangeEvent, FileSyncConfig, SyncedFile } from "./src/file-sync.js";
export { FileSyncManager } from "./src/file-sync.js";
export type {
  AgentConfig,
  FileManifest,
  FileManifestEntry,
  OnLogCallback,
  PostHogAPIConfig,
} from "./src/types.js";
export { WorktreeManager } from "./src/worktree-manager.js";
