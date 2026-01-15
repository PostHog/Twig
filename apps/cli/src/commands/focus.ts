import {
  type FocusStatus,
  focusAdd,
  focusAll,
  focusEdit,
  focusNone,
  focusOnly,
  focusRemove,
  focusStatus,
} from "@array/core/commands/focus";
import {
  listConflicts,
  resolveConflictsBatch,
} from "@array/core/commands/focus-resolve";
import {
  cmd,
  cyan,
  dim,
  formatSuccess,
  green,
  message,
  red,
  yellow,
} from "../utils/output";
import { select } from "../utils/prompt";
import { requireArg, unwrap } from "../utils/run";

function displayFocusStatus(status: FocusStatus): void {
  if (!status.isFocused) {
    message(dim("Not in focus mode"));
    message("");
    if (status.allWorkspaces.length > 0) {
      message(
        `Available workspaces: ${status.allWorkspaces.map((ws) => cyan(ws.name)).join(", ")}`,
      );
      message("");
      message(`Start focus with: ${cmd("arr focus add <workspace>")}`);
      message(`Or focus all:     ${cmd("arr focus all")}`);
    } else {
      message(dim("No workspaces available"));
      message(`Create one with: ${cmd("arr workspace add <name>")}`);
    }
    return;
  }

  message(`${green("Focus mode")}`);
  message("");
  message(`Focusing: ${status.workspaces.map((ws) => cyan(ws)).join(", ")}`);

  // Show workspaces not in focus
  const notInFocus = status.allWorkspaces.filter(
    (ws) => !status.workspaces.includes(ws.name),
  );
  if (notInFocus.length > 0) {
    message(dim(`Not in focus: ${notInFocus.map((ws) => ws.name).join(", ")}`));
  }

  // Show conflicts
  if (status.conflicts.length > 0) {
    message("");
    message(`${red("⚠")}  ${red("Conflicts detected:")}`);
    for (const conflict of status.conflicts) {
      const wsNames =
        conflict.workspaces.length > 0
          ? conflict.workspaces.map((ws) => yellow(ws)).join(", ")
          : dim("unknown");
      message(`   ${conflict.file} ${dim("←")} ${wsNames}`);
    }
    message("");
    message(`${dim("Resolve with:")} ${cmd("arr focus resolve")}`);
  }
}

export async function focus(
  subcommand: string | undefined,
  args: string[],
): Promise<void> {
  // No subcommand = show status
  if (!subcommand || subcommand === "status") {
    const status = unwrap(await focusStatus());
    displayFocusStatus(status);
    return;
  }

  switch (subcommand) {
    case "add": {
      requireArg(args[0], "Usage: arr focus add <workspace...>");
      const result = unwrap(await focusAdd(args));
      message(formatSuccess(`Added ${args.join(", ")} to focus`));
      message("");
      displayFocusStatus(result);
      break;
    }

    case "remove":
    case "rm": {
      requireArg(args[0], "Usage: arr focus remove <workspace...>");
      const result = unwrap(await focusRemove(args));
      message(formatSuccess(`Removed ${args.join(", ")} from focus`));
      message("");
      displayFocusStatus(result);
      break;
    }

    case "only": {
      requireArg(args[0], "Usage: arr focus only <workspace>");
      const result = unwrap(await focusOnly(args[0]));
      message(formatSuccess(`Now focusing only ${cyan(args[0])}`));
      message("");
      displayFocusStatus(result);
      break;
    }

    case "all": {
      const result = unwrap(await focusAll());
      message(formatSuccess("Now focusing all workspaces"));
      message("");
      displayFocusStatus(result);
      break;
    }

    case "edit": {
      requireArg(args[0], "Usage: arr focus edit <workspace>");
      const result = unwrap(await focusEdit(args[0]));
      message(formatSuccess(`Editing ${cyan(args[0])} (files are writable)`));
      message("");
      displayFocusStatus(result);
      break;
    }

    case "none":
    case "exit": {
      unwrap(await focusNone());
      message(formatSuccess("Exited focus mode"));
      break;
    }

    case "conflicts": {
      const conflicts = unwrap(await listConflicts());

      if (conflicts.length === 0) {
        message(green("No conflicts"));
        return;
      }

      message(
        `${red("Conflicts:")} ${conflicts.length} file${conflicts.length === 1 ? "" : "s"}`,
      );
      message("");
      for (const conflict of conflicts) {
        message(`  ${conflict.file}`);
        message(dim(`    Modified by: ${conflict.workspaces.join(", ")}`));
      }
      message("");
      message(`${dim("Resolve with:")} ${cmd("arr focus resolve")}`);
      break;
    }

    case "resolve": {
      const conflicts = unwrap(await listConflicts());

      if (conflicts.length === 0) {
        message(green("No conflicts to resolve"));
        return;
      }

      // Collect user choices for each conflict
      const choices = new Map<string, string>();

      for (const conflict of conflicts) {
        message(`${yellow("Conflict:")} ${cyan(conflict.file)}`);
        message(dim(`  Modified by: ${conflict.workspaces.join(", ")}`));
        message("");

        const choice = await select(
          "Which version do you want to keep in focus?",
          conflict.workspaces.map((ws) => ({ label: ws, value: ws })),
        );

        if (!choice) {
          message(dim("Cancelled"));
          return;
        }

        choices.set(conflict.file, choice);
        message("");
      }

      // Resolve all conflicts in batch
      const results = unwrap(await resolveConflictsBatch(choices));

      const removedWorkspaces = new Set(results.flatMap((r) => r.removed));
      message(
        formatSuccess(
          `Resolved ${results.length} conflict${results.length === 1 ? "" : "s"}, removed ${[...removedWorkspaces].join(", ")} from focus`,
        ),
      );
      break;
    }

    default:
      message(
        "Usage: arr focus [add|remove|only|all|edit|none|resolve] [workspace...]",
      );
      message("");
      message("Subcommands:");
      message("  (none)           Show current focus state");
      message("  add <ws...>      Add workspaces to focus");
      message("  remove <ws...>   Remove workspaces from focus");
      message("  only <ws>        Focus only this workspace");
      message("  all              Focus all workspaces");
      message(
        "  edit <ws>        Edit mode (single workspace, files writable)",
      );
      message("  none             Exit focus mode");
      message("  conflicts        List file conflicts");
      message("  resolve <file>   Resolve a file conflict interactively");
  }
}
