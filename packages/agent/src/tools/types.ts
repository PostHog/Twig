/**
 * Tool category classification for grouping related tools.
 * Makes it easier for UIs to filter and display tools by function.
 */
export type ToolCategory =
  | "filesystem" // File operations: Read, Write, Edit, Glob, NotebookEdit
  | "shell" // Shell operations: Bash, BashOutput, KillShell
  | "web" // Web operations: WebFetch, WebSearch
  | "assistant" // Assistant operations: Task, TodoWrite, ExitPlanMode
  | "search" // Search operations: Grep
  | "unknown"; // Unknown or unrecognized tools

/**
 * Base tool interface representing a tool that can be called by the agent.
 * Each tool has a name, category, and human-readable description.
 */
export interface Tool {
  name: string;
  category: ToolCategory;
  description: string;
}

// Filesystem tools

export interface ReadTool extends Tool {
  name: "Read";
  category: "filesystem";
}

export interface WriteTool extends Tool {
  name: "Write";
  category: "filesystem";
}

export interface EditTool extends Tool {
  name: "Edit";
  category: "filesystem";
}

export interface GlobTool extends Tool {
  name: "Glob";
  category: "filesystem";
}

export interface NotebookEditTool extends Tool {
  name: "NotebookEdit";
  category: "filesystem";
}

// Shell tools

export interface BashTool extends Tool {
  name: "Bash";
  category: "shell";
}

export interface BashOutputTool extends Tool {
  name: "BashOutput";
  category: "shell";
}

export interface KillShellTool extends Tool {
  name: "KillShell";
  category: "shell";
}

// Web tools

export interface WebFetchTool extends Tool {
  name: "WebFetch";
  category: "web";
}

export interface WebSearchTool extends Tool {
  name: "WebSearch";
  category: "web";
}

// Search tools

export interface GrepTool extends Tool {
  name: "Grep";
  category: "search";
}

// Assistant tools

export interface TaskTool extends Tool {
  name: "Task";
  category: "assistant";
}

export interface TodoWriteTool extends Tool {
  name: "TodoWrite";
  category: "assistant";
}

export interface ExitPlanModeTool extends Tool {
  name: "ExitPlanMode";
  category: "assistant";
}

export interface SlashCommandTool extends Tool {
  name: "SlashCommand";
  category: "assistant";
}

export interface WritePlanTool extends Tool {
  name: "WritePlan";
  category: "assistant";
}

export interface ReadPlanTool extends Tool {
  name: "ReadPlan";
  category: "assistant";
}

/**
 * Union type of all known tool types.
 * Useful for discriminated unions and type narrowing.
 */
export type KnownTool =
  | ReadTool
  | WriteTool
  | EditTool
  | GlobTool
  | NotebookEditTool
  | BashTool
  | BashOutputTool
  | KillShellTool
  | WebFetchTool
  | WebSearchTool
  | GrepTool
  | TaskTool
  | TodoWriteTool
  | ExitPlanModeTool
  | SlashCommandTool
  | WritePlanTool
  | ReadPlanTool;
