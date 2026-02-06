export {
  getAvailableModes,
  type ModeInfo,
  TWIG_EXECUTION_MODES,
  type TwigExecutionMode,
} from "../../execution-mode.js";

import type { TwigExecutionMode } from "../../execution-mode.js";

export const READ_TOOLS: Set<string> = new Set(["Read", "NotebookRead"]);

export const WRITE_TOOLS: Set<string> = new Set([
  "Edit",
  "Write",
  "NotebookEdit",
]);

export const BASH_TOOLS: Set<string> = new Set([
  "Bash",
  "BashOutput",
  "KillShell",
]);

export const SEARCH_TOOLS: Set<string> = new Set(["Glob", "Grep", "LS"]);

export const WEB_TOOLS: Set<string> = new Set(["WebSearch", "WebFetch"]);

export const AGENT_TOOLS: Set<string> = new Set(["Task", "TodoWrite"]);

const BASE_ALLOWED_TOOLS = [
  ...READ_TOOLS,
  ...SEARCH_TOOLS,
  ...WEB_TOOLS,
  ...AGENT_TOOLS,
];

const AUTO_ALLOWED_TOOLS: Record<string, Set<string>> = {
  default: new Set(BASE_ALLOWED_TOOLS),
  acceptEdits: new Set([...BASE_ALLOWED_TOOLS, ...WRITE_TOOLS]),
  plan: new Set(BASE_ALLOWED_TOOLS),
};

export function isToolAllowedForMode(
  toolName: string,
  mode: TwigExecutionMode,
): boolean {
  return (
    mode === "bypassPermissions" ||
    AUTO_ALLOWED_TOOLS[mode]?.has(toolName) === true
  );
}
