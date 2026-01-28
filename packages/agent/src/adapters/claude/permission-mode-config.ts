import type { PermissionMode } from "@anthropic-ai/claude-agent-sdk";

// TODO: Use TwigToolKind here instead.
const BASE_ALLOWED_TOOLS = new Set([
  "TodoWrite",
  "Glob",
  "Grep",
  "Read",
  "LS",
  "WebSearch",
  "WebFetch",
  "Task",
]);

// TODO: Key this with our own TwigMode type instead of reusing an agents PermissionMode
const MODE_ALLOWED_TOOLS: Record<PermissionMode, Set<string>> = {
  default: new Set(),
  acceptEdits: new Set(["Edit", "Write", "NotebookEdit"]),
  plan: new Set(),
  bypassPermissions: new Set(),
  delegate: new Set(),
  dontAsk: new Set(),
};

export function isToolAllowedForMode(
  toolName: string,
  mode: PermissionMode,
): boolean {
  if (BASE_ALLOWED_TOOLS.has(toolName)) {
    return true;
  }
  if (mode === "bypassPermissions") {
    return true;
  }
  return MODE_ALLOWED_TOOLS[mode]?.has(toolName) ?? false;
}
