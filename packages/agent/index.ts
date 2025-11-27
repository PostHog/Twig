// Main entry point - re-exports from src

export { ClaudeAdapter } from "./src/adapters/claude/claude-adapter.js";
// Provider adapter types
export type { ProviderAdapter } from "./src/adapters/types.js";
export { Agent } from "./src/agent.js";
export type { TodoItem, TodoList } from "./src/todo-manager.js";
// Todo management
export { TodoManager } from "./src/todo-manager.js";
export { ToolRegistry } from "./src/tools/registry.js";
// Tool types
export type {
  BashOutputTool,
  BashTool,
  EditTool,
  ExitPlanModeTool,
  GlobTool,
  GrepTool,
  KillShellTool,
  KnownTool,
  NotebookEditTool,
  ReadTool,
  SlashCommandTool,
  TaskTool,
  TodoWriteTool,
  Tool,
  ToolCategory,
  WebFetchTool,
  WebSearchTool,
  WriteTool,
} from "./src/tools/types.js";
export type {
  AgentConfig,
  AgentEvent,
  ExecutionResult,
  LogLevel as LogLevelType,
  McpServerConfig,
  OnLogCallback,
  ResearchEvaluation,
  SupportingFile,
  Task,
  TaskRun,
  WorktreeInfo,
} from "./src/types.js";
export { PermissionMode } from "./src/types.js";
export type { LoggerConfig } from "./src/utils/logger.js";
export {
  Logger,
  LogLevel,
} from "./src/utils/logger.js";
export type { WorktreeConfig } from "./src/worktree-manager.js";
// Worktree management
export { WorktreeManager } from "./src/worktree-manager.js";
