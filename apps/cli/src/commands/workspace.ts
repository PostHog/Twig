import { workspaceAdd } from "@array/core/commands/workspace-add";
import { workspaceList } from "@array/core/commands/workspace-list";
import { workspaceRemove } from "@array/core/commands/workspace-remove";
import { workspaceStatus } from "@array/core/commands/workspace-status";
import { submitWorkspace } from "@array/core/commands/workspace-submit";
import {
  cyan,
  dim,
  formatSuccess,
  green,
  message,
  red,
  yellow,
} from "../utils/output";
import { textInput } from "../utils/prompt";
import { requireArg, unwrap } from "../utils/run";

function formatStatusChar(status: "M" | "A" | "D" | "R"): string {
  switch (status) {
    case "M":
      return yellow("M");
    case "A":
      return green("A");
    case "D":
      return red("D");
    case "R":
      return cyan("R");
  }
}

export async function workspace(
  subcommand: string,
  args: string[],
): Promise<void> {
  switch (subcommand) {
    case "add": {
      requireArg(args[0], "Usage: arr workspace add <name>");
      const result = unwrap(await workspaceAdd(args[0]));
      message(formatSuccess(`Created workspace ${cyan(result.name)}`));
      message(dim(`  Path: ${result.path}`));
      message(dim(`  Change: ${result.changeId.slice(0, 8)}`));
      message("");
      message(`To use this workspace:`);
      message(dim(`  cd ${result.path}`));
      break;
    }

    case "remove":
    case "rm": {
      requireArg(args[0], "Usage: arr workspace remove <name>");
      unwrap(await workspaceRemove(args[0]));
      message(formatSuccess(`Removed workspace ${args[0]}`));
      break;
    }

    case "list":
    case "ls": {
      const workspaces = unwrap(await workspaceList());

      if (workspaces.length === 0) {
        message(dim("No workspaces found"));
        message("");
        message(`Create one with: ${cyan("arr workspace add <name>")}`);
        return;
      }

      message(
        `${workspaces.length} workspace${workspaces.length === 1 ? "" : "s"}:`,
      );
      message("");

      for (const ws of workspaces) {
        const staleIndicator = ws.isStale ? yellow(" (stale)") : "";
        message(`  ${green(ws.name)}${staleIndicator}`);
        message(dim(`    ${ws.changeId.slice(0, 8)} · ${ws.path}`));
      }
      break;
    }

    case "status":
    case "st": {
      const statuses = unwrap(await workspaceStatus(args[0]));

      if (statuses.length === 0) {
        message(dim("No workspaces found"));
        return;
      }

      for (const ws of statuses) {
        message(`${green(ws.name)} changes:`);

        if (ws.changes.length === 0) {
          message(dim("  (no changes)"));
        } else {
          for (const change of ws.changes) {
            message(`  ${formatStatusChar(change.status)} ${change.path}`);
          }

          const { added, removed, files } = ws.stats;
          if (files > 0) {
            message(
              `  ${green(`+${added}`)} ${red(`-${removed}`)} ${dim(`${files} file${files === 1 ? "" : "s"} changed`)}`,
            );
          }
        }
        message("");
      }
      break;
    }

    case "submit": {
      requireArg(args[0], "Usage: arr workspace submit <name> [-m <message>]");

      const draft = args.includes("--draft") || args.includes("-d");
      const msgIdx = args.indexOf("--message");
      const mIdx = args.indexOf("-m");
      const msgFlagIdx = msgIdx !== -1 ? msgIdx : mIdx;
      let msg = msgFlagIdx !== -1 ? args[msgFlagIdx + 1] : undefined;

      // Try to submit - if missing message, prompt for it
      let result = await submitWorkspace(args[0], { draft, message: msg });

      if (!result.ok && result.error.code === "MISSING_MESSAGE") {
        const prompted = await textInput("Commit message");
        if (!prompted) {
          message(dim("Cancelled"));
          return;
        }
        msg = prompted;
        result = await submitWorkspace(args[0], { draft, message: msg });
      }

      const value = unwrap(result);

      if (value.status === "created") {
        message(formatSuccess(`Created PR for ${cyan(value.workspace)}`));
      } else {
        message(formatSuccess(`Updated PR for ${cyan(value.workspace)}`));
      }
      message(`  ${dim("PR:")} ${value.prUrl}`);
      message(`  ${dim("Branch:")} ${value.bookmark}`);
      break;
    }

    default:
      message("Usage: arr workspace <add|remove|list|status|submit> [name]");
      message("");
      message("Subcommands:");
      message("  add <name>      Create a new workspace");
      message("  remove <name>   Remove a workspace");
      message("  list            List all workspaces");
      message("  status [name]   Show changes in workspace(s)");
      message("  submit <name>   Submit workspace as a GitHub PR");
  }
}
