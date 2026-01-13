import {
  type PreviewStatus,
  previewAdd,
  previewAll,
  previewEdit,
  previewNone,
  previewOnly,
  previewRemove,
  previewStatus,
} from "@array/core/commands/preview";
import { listConflicts } from "@array/core/commands/preview-resolve";
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

function displayPreviewStatus(status: PreviewStatus): void {
  if (!status.isPreview) {
    message(dim("Not in preview mode"));
    message("");
    if (status.allWorkspaces.length > 0) {
      message(
        `Available workspaces: ${status.allWorkspaces.map((ws) => cyan(ws.name)).join(", ")}`,
      );
      message("");
      message(`Start preview with: ${cmd("arr preview add <workspace>")}`);
      message(`Or preview all:     ${cmd("arr preview all")}`);
    } else {
      message(dim("No workspaces available"));
      message(`Create one with: ${cmd("arr workspace add <name>")}`);
    }
    return;
  }

  message(`${green("Preview mode")}`);
  message("");
  message(`Previewing: ${status.workspaces.map((ws) => cyan(ws)).join(", ")}`);

  // Show workspaces not in preview
  const notInPreview = status.allWorkspaces.filter(
    (ws) => !status.workspaces.includes(ws.name),
  );
  if (notInPreview.length > 0) {
    message(
      dim(`Not in preview: ${notInPreview.map((ws) => ws.name).join(", ")}`),
    );
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
    message(`${dim("Resolve with:")} ${cmd("arr preview resolve")}`);
  }
}

export async function preview(
  subcommand: string | undefined,
  args: string[],
): Promise<void> {
  // No subcommand = show status
  if (!subcommand || subcommand === "status") {
    const status = unwrap(await previewStatus());
    displayPreviewStatus(status);
    return;
  }

  switch (subcommand) {
    case "add": {
      requireArg(args[0], "Usage: arr preview add <workspace...>");
      const result = unwrap(await previewAdd(args));
      message(formatSuccess(`Added ${args.join(", ")} to preview`));
      message("");
      displayPreviewStatus(result);
      break;
    }

    case "remove":
    case "rm": {
      requireArg(args[0], "Usage: arr preview remove <workspace...>");
      const result = unwrap(await previewRemove(args));
      message(formatSuccess(`Removed ${args.join(", ")} from preview`));
      message("");
      displayPreviewStatus(result);
      break;
    }

    case "only": {
      requireArg(args[0], "Usage: arr preview only <workspace>");
      const result = unwrap(await previewOnly(args[0]));
      message(formatSuccess(`Now previewing only ${cyan(args[0])}`));
      message("");
      displayPreviewStatus(result);
      break;
    }

    case "all": {
      const result = unwrap(await previewAll());
      message(formatSuccess("Now previewing all workspaces"));
      message("");
      displayPreviewStatus(result);
      break;
    }

    case "edit": {
      requireArg(args[0], "Usage: arr preview edit <workspace>");
      const result = unwrap(await previewEdit(args[0]));
      message(formatSuccess(`Editing ${cyan(args[0])} (files are writable)`));
      message("");
      displayPreviewStatus(result);
      break;
    }

    case "none":
    case "exit": {
      unwrap(await previewNone());
      message(formatSuccess("Exited preview mode"));
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
      message(`${dim("Resolve with:")} ${cmd("arr preview resolve")}`);
      break;
    }

    case "resolve": {
      const conflicts = unwrap(await listConflicts());

      if (conflicts.length === 0) {
        message(green("No conflicts to resolve"));
        return;
      }

      const removedWorkspaces = new Set<string>();
      let resolved = 0;
      let skipped = 0;

      for (const conflict of conflicts) {
        // Filter out workspaces that have already been removed
        const remainingWorkspaces = conflict.workspaces.filter(
          (ws) => !removedWorkspaces.has(ws),
        );

        // If only one workspace remains, no conflict to resolve
        if (remainingWorkspaces.length < 2) {
          skipped++;
          continue;
        }

        message(`${yellow("Conflict:")} ${cyan(conflict.file)}`);
        message(dim(`  Modified by: ${remainingWorkspaces.join(", ")}`));
        message("");

        const choice = await select(
          "Which version do you want to keep in focus?",
          remainingWorkspaces.map((ws) => ({ label: ws, value: ws })),
        );

        if (!choice) {
          message(dim("Cancelled"));
          return;
        }

        // Mark non-chosen workspaces as removed
        for (const ws of remainingWorkspaces) {
          if (ws !== choice) {
            removedWorkspaces.add(ws);
          }
        }

        resolved++;
        message("");
      }

      // Actually remove the workspaces from preview
      if (removedWorkspaces.size > 0) {
        unwrap(await previewRemove([...removedWorkspaces]));
      }

      message(
        formatSuccess(
          `Resolved ${resolved} conflict${resolved === 1 ? "" : "s"}, removed ${[...removedWorkspaces].join(", ")} from preview`,
        ),
      );
      if (skipped > 0) {
        message(
          dim(
            `Skipped ${skipped} conflict${skipped === 1 ? "" : "s"} (already resolved)`,
          ),
        );
      }
      break;
    }

    default:
      message(
        "Usage: arr preview [add|remove|only|all|edit|none|resolve] [workspace...]",
      );
      message("");
      message("Subcommands:");
      message("  (none)           Show current preview state");
      message("  add <ws...>      Add workspaces to preview");
      message("  remove <ws...>   Remove workspaces from preview");
      message("  only <ws>        Preview only this workspace");
      message("  all              Preview all workspaces");
      message(
        "  edit <ws>        Edit mode (single workspace, files writable)",
      );
      message("  none             Exit preview mode");
      message("  conflicts        List file conflicts");
      message("  resolve <file>   Resolve a file conflict interactively");
  }
}
