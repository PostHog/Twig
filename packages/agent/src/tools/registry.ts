import type { Tool } from "./types.js";

/**
 * Registry of all known tools with their metadata.
 * Maps tool names to their definitions.
 */
const TOOL_DEFINITIONS: Record<string, Tool> = {
  // Filesystem tools
  Read: {
    name: "Read",
    category: "filesystem",
    description: "Read file contents from the filesystem",
  },
  Write: {
    name: "Write",
    category: "filesystem",
    description: "Write content to a file",
  },
  Edit: {
    name: "Edit",
    category: "filesystem",
    description: "Edit file with find and replace operations",
  },
  Glob: {
    name: "Glob",
    category: "filesystem",
    description: "Find files matching a pattern",
  },
  NotebookEdit: {
    name: "NotebookEdit",
    category: "filesystem",
    description: "Edit Jupyter notebook cells",
  },

  // Shell tools
  Bash: {
    name: "Bash",
    category: "shell",
    description: "Execute bash commands",
  },
  BashOutput: {
    name: "BashOutput",
    category: "shell",
    description: "Read output from a background bash process",
  },
  KillShell: {
    name: "KillShell",
    category: "shell",
    description: "Terminate a background bash process",
  },

  // Web tools
  WebFetch: {
    name: "WebFetch",
    category: "web",
    description: "Fetch content from a URL",
  },
  WebSearch: {
    name: "WebSearch",
    category: "web",
    description: "Search the web",
  },

  // Search tools
  Grep: {
    name: "Grep",
    category: "search",
    description: "Search file contents using patterns",
  },

  // Assistant tools
  Task: {
    name: "Task",
    category: "assistant",
    description: "Launch a specialized agent for a sub-task",
  },
  TodoWrite: {
    name: "TodoWrite",
    category: "assistant",
    description: "Manage task list and track progress",
  },
  ExitPlanMode: {
    name: "ExitPlanMode",
    category: "assistant",
    description: "Exit plan mode and present plan to user",
  },
  SlashCommand: {
    name: "SlashCommand",
    category: "assistant",
    description: "Execute a slash command",
  },
  WritePlan: {
    name: "WritePlan",
    category: "assistant",
    description: "Write or update the implementation plan file",
  },
  ReadPlan: {
    name: "ReadPlan",
    category: "assistant",
    description: "Read the current implementation plan file",
  },
};

/**
 * Tool registry for looking up tool definitions by name.
 * Provides metadata about tools for UI consumption.
 */
export class ToolRegistry {
  /**
   * Get tool definition by name.
   * Returns undefined if tool is not recognized.
   */
  get(name: string): Tool | undefined {
    return TOOL_DEFINITIONS[name];
  }

  /**
   * Get all registered tools.
   */
  getAll(): Tool[] {
    return Object.values(TOOL_DEFINITIONS);
  }

  /**
   * Check if a tool name is registered.
   */
  has(name: string): boolean {
    return name in TOOL_DEFINITIONS;
  }

  /**
   * Get all tools in a specific category.
   */
  getByCategory(category: string): Tool[] {
    return Object.values(TOOL_DEFINITIONS).filter(
      (tool) => tool.category === category,
    );
  }
}
