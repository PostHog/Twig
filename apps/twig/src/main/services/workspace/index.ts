// Re-export from service

// Re-export from config
export { loadConfig, normalizeScripts } from "./configLoader.js";
export type { ArrayConfig, ConfigValidationResult } from "./configSchema.js";
export { arrayConfigSchema, validateConfig } from "./configSchema.js";
// Re-export schemas
export * from "./schemas.js";
export type { WorkspaceServiceEvents } from "./service.js";
export { WorkspaceService, WorkspaceServiceEvent } from "./service.js";
