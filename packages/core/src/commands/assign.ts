import { runJJ } from "../jj/runner";
import {
  addWorkspace,
  getUnassignedFiles,
  UNASSIGNED_WORKSPACE,
} from "../jj/workspace";
import { createError, err, ok, type Result } from "../result";
import type { Command } from "./types";

export interface AssignResult {
  files: string[];
  from: string;
  to: string;
}

/**
 * Match files against pathspecs.
 * Supports glob patterns like *.txt, src/**, etc.
 */
function matchFiles(patterns: string[], availableFiles: string[]): string[] {
  const matched = new Set<string>();

  for (const pattern of patterns) {
    // Convert glob pattern to regex
    const regexPattern = pattern
      .replace(/\./g, "\\.")
      .replace(/\*\*/g, "{{GLOBSTAR}}")
      .replace(/\*/g, "[^/]*")
      .replace(/{{GLOBSTAR}}/g, ".*");

    const regex = new RegExp(`^${regexPattern}$`);

    for (const file of availableFiles) {
      if (regex.test(file) || file === pattern) {
        matched.add(file);
      }
    }
  }

  return [...matched];
}

/**
 * Move files from unassigned workspace to a specific workspace.
 * Supports multiple files and glob patterns.
 * Uses jj squash to atomically move the changes.
 */
export async function assignFiles(
  patterns: string[],
  targetWorkspace: string,
  cwd = process.cwd(),
): Promise<Result<AssignResult>> {
  if (patterns.length === 0) {
    return err(createError("INVALID_INPUT", "No files specified"));
  }

  // Get files in unassigned
  const unassignedFiles = await getUnassignedFiles(cwd);
  if (!unassignedFiles.ok) return unassignedFiles;

  if (unassignedFiles.value.length === 0) {
    return err(createError("NOT_FOUND", "No files in unassigned workspace"));
  }

  // Match patterns against available files
  const filesToAssign = matchFiles(patterns, unassignedFiles.value);

  if (filesToAssign.length === 0) {
    return err(
      createError(
        "NOT_FOUND",
        `No matching files in unassigned workspace for: ${patterns.join(", ")}`,
      ),
    );
  }

  // Squash files from unassigned to target workspace
  // jj squash --from unassigned@ --into <target>@ <file1> <file2> ...
  const result = await runJJ(
    [
      "squash",
      "--from",
      `${UNASSIGNED_WORKSPACE}@`,
      "--into",
      `${targetWorkspace}@`,
      ...filesToAssign,
    ],
    cwd,
  );

  if (!result.ok) return result;

  return ok({
    files: filesToAssign,
    from: UNASSIGNED_WORKSPACE,
    to: targetWorkspace,
  });
}

/**
 * Create a new workspace from unassigned files.
 * Supports multiple files and glob patterns.
 */
export async function assignFilesToNewWorkspace(
  patterns: string[],
  newWorkspaceName: string,
  cwd = process.cwd(),
): Promise<Result<AssignResult>> {
  if (patterns.length === 0) {
    return err(createError("INVALID_INPUT", "No files specified"));
  }

  // Get files in unassigned
  const unassignedFiles = await getUnassignedFiles(cwd);
  if (!unassignedFiles.ok) return unassignedFiles;

  if (unassignedFiles.value.length === 0) {
    return err(createError("NOT_FOUND", "No files in unassigned workspace"));
  }

  // Match patterns against available files
  const filesToAssign = matchFiles(patterns, unassignedFiles.value);

  if (filesToAssign.length === 0) {
    return err(
      createError(
        "NOT_FOUND",
        `No matching files in unassigned workspace for: ${patterns.join(", ")}`,
      ),
    );
  }

  // Create the new workspace
  const createResult = await addWorkspace(newWorkspaceName, cwd);
  if (!createResult.ok) return createResult;

  // Squash files from unassigned to new workspace
  const squashResult = await runJJ(
    [
      "squash",
      "--from",
      `${UNASSIGNED_WORKSPACE}@`,
      "--into",
      `${newWorkspaceName}@`,
      ...filesToAssign,
    ],
    cwd,
  );

  if (!squashResult.ok) return squashResult;

  return ok({
    files: filesToAssign,
    from: UNASSIGNED_WORKSPACE,
    to: newWorkspaceName,
  });
}

export interface UnassignedListResult {
  files: string[];
}

/**
 * List files in the unassigned workspace.
 */
export async function listUnassigned(
  cwd = process.cwd(),
): Promise<Result<UnassignedListResult>> {
  const result = await getUnassignedFiles(cwd);
  if (!result.ok) return result;

  return ok({ files: result.value });
}

// Command exports
export const assignCommand: Command<AssignResult, [string[], string, string?]> =
  {
    meta: {
      name: "assign",
      args: "<file...> <workspace>",
      description: "Move unassigned files to a workspace",
      category: "workflow",
      flags: [
        {
          name: "new",
          short: "n",
          description: "Create new workspace with this name",
        },
      ],
    },
    run: assignFiles,
  };

export const unassignedListCommand: Command<UnassignedListResult, [string?]> = {
  meta: {
    name: "unassigned list",
    description: "List files in unassigned workspace",
    category: "info",
  },
  run: listUnassigned,
};
