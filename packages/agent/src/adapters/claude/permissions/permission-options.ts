import { BASH_TOOLS, READ_TOOLS, SEARCH_TOOLS, WRITE_TOOLS } from "../tools.js";

export interface PermissionOption {
  kind: "allow_once" | "allow_always" | "reject_once" | "reject_always";
  name: string;
  optionId: string;
  _meta?: { description?: string; customInput?: boolean };
}

function permissionOptions(allowAlwaysLabel: string): PermissionOption[] {
  return [
    { kind: "allow_once", name: "Yes", optionId: "allow" },
    { kind: "allow_always", name: allowAlwaysLabel, optionId: "allow_always" },
    {
      kind: "reject_once",
      name: "No, and tell the agent what to do differently",
      optionId: "reject",
      _meta: { customInput: true },
    },
  ];
}

export function buildPermissionOptions(
  toolName: string,
  toolInput: Record<string, unknown>,
  cwd?: string,
): PermissionOption[] {
  if (BASH_TOOLS.has(toolName)) {
    const command = toolInput?.command as string | undefined;
    const cmdName = command?.split(/\s+/)[0] ?? "this command";
    const cwdLabel = cwd ? ` in ${cwd}` : "";
    return permissionOptions(
      `Yes, and don't ask again for \`${cmdName}\` commands${cwdLabel}`,
    );
  }

  if (toolName === "BashOutput") {
    return permissionOptions("Yes, allow all background process reads");
  }

  if (toolName === "KillShell") {
    return permissionOptions("Yes, allow killing processes");
  }

  if (WRITE_TOOLS.has(toolName)) {
    return permissionOptions("Yes, allow all edits during this session");
  }

  if (READ_TOOLS.has(toolName)) {
    return permissionOptions("Yes, allow all reads during this session");
  }

  if (SEARCH_TOOLS.has(toolName)) {
    return permissionOptions("Yes, allow all searches during this session");
  }

  if (toolName === "WebFetch") {
    const url = toolInput?.url as string | undefined;
    let domain = "";
    try {
      domain = url ? new URL(url).hostname : "";
    } catch {}
    return permissionOptions(
      domain
        ? `Yes, allow all fetches from ${domain}`
        : "Yes, allow all fetches",
    );
  }

  if (toolName === "WebSearch") {
    return permissionOptions("Yes, allow all web searches");
  }

  if (toolName === "Task") {
    return permissionOptions("Yes, allow all sub-tasks");
  }

  if (toolName === "TodoWrite") {
    return permissionOptions("Yes, allow all todo updates");
  }

  return permissionOptions("Yes, always allow");
}
