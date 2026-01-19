import { runJJ } from "../jj/runner";
import {
  addWorkspace,
  getRepoRoot,
  getWcFiles,
  workspaceRef,
} from "../jj/workspace";
import { createError, err, ok, type Result } from "../result";
import { readFocusState } from "./focus";
import type { Command } from "./types";

export interface AssignResult {
  files: string[];
  from: string;
  to: string;
}

/**
 * Escape all regex metacharacters in a string.
 */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Match files against pathspecs.
 * Supports glob patterns like *.txt, src/**, etc.
 */
function matchFiles(patterns: string[], availableFiles: string[]): string[] {
  const matched = new Set<string>();

  for (const pattern of patterns) {
    // Use placeholders for glob tokens before escaping
    const withPlaceholders = pattern
      .replace(/\*\*/g, "\0GLOBSTAR\0")
      .replace(/\*/g, "\0GLOB\0");

    // Escape all regex metacharacters
    const escaped = escapeRegex(withPlaceholders);

    // Replace placeholders with regex equivalents
    const regexPattern = escaped
      .replace(/\0GLOBSTAR\0/g, ".*")
      .replace(/\0GLOB\0/g, "[^/]*");

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
 * Move files from wc commit to a specific workspace.
 * Supports multiple files and glob patterns.
 * Uses jj squash to atomically move the changes.
 *
 * Must be in focus mode (on a wc: commit) to use this command.
 */
export async function assignFiles(
  patterns: string[],
  targetWorkspace: string,
  cwd = process.cwd(),
): Promise<Result<AssignResult>> {
  if (patterns.length === 0) {
    return err(createError("INVALID_INPUT", "No files specified"));
  }

  // Get repo root
  const rootResult = await getRepoRoot(cwd);
  if (!rootResult.ok) return rootResult;
  const repoPath = rootResult.value;

  // Check if in focus mode
  const focusState = readFocusState(repoPath);
  if (focusState.workspaces.length === 0) {
    return err(
      createError(
        "INVALID_STATE",
        "Not in focus mode. Use 'arr focus add <workspace>' first.",
      ),
    );
  }

  // Get files in wc commit
  const wcFiles = await getWcFiles(cwd);
  if (!wcFiles.ok) return wcFiles;

  if (wcFiles.value.length === 0) {
    return err(createError("NOT_FOUND", "No files in working copy to assign"));
  }

  // Match patterns against available files
  const filesToAssign = matchFiles(patterns, wcFiles.value);

  if (filesToAssign.length === 0) {
    return err(
      createError(
        "NOT_FOUND",
        `No matching files in working copy for: ${patterns.join(", ")}`,
      ),
    );
  }

  // Squash files from wc (current @) to target workspace
  // jj squash --from @ --into <target>@ <file1> <file2> ...
  const result = await runJJ(
    [
      "squash",
      "--from",
      "@",
      "--into",
      workspaceRef(targetWorkspace),
      ...filesToAssign,
    ],
    cwd,
  );

  if (!result.ok) return result;

  return ok({
    files: filesToAssign,
    from: "wc",
    to: targetWorkspace,
  });
}

/**
 * Create a new workspace from wc files.
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

  // Get repo root
  const rootResult = await getRepoRoot(cwd);
  if (!rootResult.ok) return rootResult;
  const repoPath = rootResult.value;

  // Check if in focus mode
  const focusState = readFocusState(repoPath);
  if (focusState.workspaces.length === 0) {
    return err(
      createError(
        "INVALID_STATE",
        "Not in focus mode. Use 'arr focus add <workspace>' first.",
      ),
    );
  }

  // Get files in wc commit
  const wcFiles = await getWcFiles(cwd);
  if (!wcFiles.ok) return wcFiles;

  if (wcFiles.value.length === 0) {
    return err(createError("NOT_FOUND", "No files in working copy to assign"));
  }

  // Match patterns against available files
  const filesToAssign = matchFiles(patterns, wcFiles.value);

  if (filesToAssign.length === 0) {
    return err(
      createError(
        "NOT_FOUND",
        `No matching files in working copy for: ${patterns.join(", ")}`,
      ),
    );
  }

  // Create the new workspace
  const createResult = await addWorkspace(newWorkspaceName, cwd);
  if (!createResult.ok) return createResult;

  // Squash files from wc to new workspace
  const squashResult = await runJJ(
    [
      "squash",
      "--from",
      "@",
      "--into",
      workspaceRef(newWorkspaceName),
      ...filesToAssign,
    ],
    cwd,
  );

  if (!squashResult.ok) return squashResult;

  return ok({
    files: filesToAssign,
    from: "wc",
    to: newWorkspaceName,
  });
}

export interface WcListResult {
  files: string[];
}

/**
 * List files in the wc commit (current working copy changes).
 */
export async function listWcFiles(
  cwd = process.cwd(),
): Promise<Result<WcListResult>> {
  const result = await getWcFiles(cwd);
  if (!result.ok) return result;

  return ok({ files: result.value });
}

// Command exports
export const assignCommand: Command<AssignResult, [string[], string, string?]> =
  {
    meta: {
      name: "assign",
      args: "<file...> <workspace>",
      description: "Move working copy files to a workspace",
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

export const wcListCommand: Command<WcListResult, [string?]> = {
  meta: {
    name: "wc list",
    description: "List files in working copy",
    category: "info",
  },
  run: listWcFiles,
};
