import { IS_ROOT } from "./utils/common.js";

export interface ModeInfo {
  id: TwigExecutionMode;
  name: string;
  description: string;
}

const MODES: ModeInfo[] = [
  {
    id: "default",
    name: "Always Ask",
    description: "Prompts for permission on first use of each tool",
  },
  {
    id: "acceptEdits",
    name: "Accept Edits",
    description: "Automatically accepts file edit permissions for the session",
  },
  {
    id: "plan",
    name: "Plan Mode",
    description: "Claude can analyze but not modify files or execute commands",
  },
  {
    id: "bypassPermissions",
    name: "Bypass Permissions",
    description: "Skips all permission prompts",
  },
];

export const TWIG_EXECUTION_MODES = [
  "default",
  "acceptEdits",
  "plan",
  "bypassPermissions",
] as const;

export type TwigExecutionMode = (typeof TWIG_EXECUTION_MODES)[number];

export function getAvailableModes(): ModeInfo[] {
  return IS_ROOT ? MODES.filter((m) => m.id !== "bypassPermissions") : MODES;
}
