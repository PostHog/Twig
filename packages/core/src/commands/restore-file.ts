import { runJJ } from "../jj/runner";
import { workspaceRef } from "../jj/workspace";
import { createError, err, ok, type Result } from "../result";
import type { Command } from "./types";

export type FileStatus =
  | "M"
  | "A"
  | "D"
  | "R"
  | "modified"
  | "added"
  | "deleted"
  | "renamed"
  | "untracked";

/**
 * Restore (discard changes to) a file in a workspace.
 *
 * For modified/deleted files: restores from the workspace's parent commit
 * For added files: removes the file from the workspace commit
 */
export async function restoreFile(
  workspace: string,
  filePath: string,
  fileStatus: FileStatus,
  cwd = process.cwd(),
): Promise<Result<void>> {
  const wsRef = workspaceRef(workspace);

  // Normalize status
  const status =
    fileStatus === "modified"
      ? "M"
      : fileStatus === "added"
        ? "A"
        : fileStatus === "deleted"
          ? "D"
          : fileStatus === "renamed"
            ? "R"
            : fileStatus === "untracked"
              ? "A" // Treat untracked as added
              : fileStatus;

  switch (status) {
    case "M":
    case "D":
    case "R": {
      // Restore from parent - this reverts the file to its state before the workspace changes
      // Get the parent of the workspace commit
      const parentResult = await runJJ(
        ["log", "-r", `${wsRef}-`, "--no-graph", "-T", "commit_id"],
        cwd,
      );
      if (!parentResult.ok) return parentResult;

      const parent = parentResult.value.stdout.trim();
      if (!parent) {
        return err(
          createError("COMMAND_FAILED", "Could not find parent commit"),
        );
      }

      // Restore the file from parent into the workspace
      const result = await runJJ(
        ["restore", "-r", wsRef, "--from", parent, filePath],
        cwd,
      );
      if (!result.ok) return result;
      break;
    }
    case "A": {
      // For added files, we need to "restore" which effectively removes the addition
      // Get the parent (which doesn't have this file)
      const parentResult = await runJJ(
        ["log", "-r", `${wsRef}-`, "--no-graph", "-T", "commit_id"],
        cwd,
      );
      if (!parentResult.ok) return parentResult;

      const parent = parentResult.value.stdout.trim();

      // Restore from parent - since file doesn't exist in parent, this removes it
      const result = await runJJ(
        ["restore", "-r", wsRef, "--from", parent, filePath],
        cwd,
      );
      if (!result.ok) return result;
      break;
    }
    default:
      return err(
        createError("INVALID_INPUT", `Unknown file status: ${status}`),
      );
  }

  return ok(undefined);
}

export const restoreFileCommand: Command<
  void,
  [string, string, FileStatus, string?]
> = {
  meta: {
    name: "restore-file",
    args: "<workspace> <file> <status>",
    description: "Restore (discard changes to) a file in a workspace",
    category: "workflow",
  },
  run: restoreFile,
};
