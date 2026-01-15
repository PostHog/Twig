import {
  assignFiles,
  assignFilesToNewWorkspace,
  listUnassigned,
} from "@array/core/commands/assign";
import { cyan, dim, formatSuccess, green, message } from "../utils/output";
import { requireArg, unwrap } from "../utils/run";

export async function assign(args: string[]): Promise<void> {
  if (args.length === 0) {
    message("Usage: arr assign <file...> <workspace>");
    message("       arr assign <file...> --new <workspace-name>");
    message("");
    message("Examples:");
    message("  arr assign config.json agent-a");
    message("  arr assign file1.txt file2.txt agent-b");
    message('  arr assign "src/**/*.ts" --new refactor');
    return;
  }

  // Check for --new flag
  const newIndex = args.indexOf("--new");
  const nIndex = args.indexOf("-n");
  const newFlagIndex = newIndex !== -1 ? newIndex : nIndex;

  if (newFlagIndex !== -1) {
    // Everything before --new is files, next arg is workspace name
    const files = args.slice(0, newFlagIndex);
    const newWorkspaceName = args[newFlagIndex + 1];

    requireArg(files[0], "Usage: arr assign <file...> --new <workspace-name>");
    requireArg(
      newWorkspaceName,
      "Usage: arr assign <file...> --new <workspace-name>",
    );

    const result = unwrap(
      await assignFilesToNewWorkspace(files, newWorkspaceName),
    );

    if (result.files.length === 1) {
      message(
        formatSuccess(
          `Assigned ${cyan(result.files[0])} to new workspace ${green(result.to)}`,
        ),
      );
    } else {
      message(
        formatSuccess(
          `Assigned ${result.files.length} files to new workspace ${green(result.to)}`,
        ),
      );
      for (const file of result.files) {
        message(`  ${cyan(file)}`);
      }
    }
    return;
  }

  // Regular assign to existing workspace
  // Last arg is workspace, everything else is files
  if (args.length < 2) {
    message("Usage: arr assign <file...> <workspace>");
    return;
  }

  const files = args.slice(0, -1);
  const targetWorkspace = args[args.length - 1];

  requireArg(files[0], "Usage: arr assign <file...> <workspace>");
  requireArg(targetWorkspace, "Usage: arr assign <file...> <workspace>");

  const result = unwrap(await assignFiles(files, targetWorkspace));

  if (result.files.length === 1) {
    message(
      formatSuccess(`Assigned ${cyan(result.files[0])} to ${green(result.to)}`),
    );
  } else {
    message(
      formatSuccess(
        `Assigned ${result.files.length} files to ${green(result.to)}`,
      ),
    );
    for (const file of result.files) {
      message(`  ${cyan(file)}`);
    }
  }
}

export async function unassigned(
  subcommand: string,
  _args: string[],
): Promise<void> {
  switch (subcommand) {
    case "list":
    case "ls": {
      const result = unwrap(await listUnassigned());

      if (result.files.length === 0) {
        message(dim("No unassigned files"));
        return;
      }

      message(
        `${result.files.length} unassigned file${result.files.length === 1 ? "" : "s"}:`,
      );
      message("");

      for (const file of result.files) {
        message(`  ${cyan(file)}`);
      }

      message("");
      message(`Assign files: ${dim("arr assign <file...> <workspace>")}`);
      break;
    }

    default:
      message("Usage: arr unassigned <list>");
      message("");
      message("Subcommands:");
      message("  list  List files in unassigned workspace");
  }
}
