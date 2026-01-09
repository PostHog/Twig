import { z } from "zod";
import { REFS_PREFIX, runGitSync, runGitSyncLines } from "./runner";

/**
 * PR state - matches GitHub GraphQL API (uppercase)
 */
export type PRState = "OPEN" | "CLOSED" | "MERGED";

/**
 * Review decision - matches GitHub GraphQL API (uppercase)
 */
export type ReviewDecision =
  | "APPROVED"
  | "REVIEW_REQUIRED"
  | "CHANGES_REQUESTED";

const prInfoSchema = z.object({
  // Required fields
  number: z.number(),
  url: z.string(),
  state: z.enum(["OPEN", "CLOSED", "MERGED"]),
  base: z.string(),
  title: z.string(),

  // Optional fields
  head: z.string().optional(),
  body: z.string().optional(),
  reviewDecision: z
    .enum(["APPROVED", "REVIEW_REQUIRED", "CHANGES_REQUESTED"])
    .nullable()
    .optional(),
  isDraft: z.boolean().optional(),
  /** Number of times PR was submitted (1 = initial, 2+ = updated via force-push) */
  version: z.number().optional(),
});

const branchMetaSchema = z.object({
  // Identity
  changeId: z.string(),
  commitId: z.string(),

  // Stack relationship
  parentBranchName: z.string(),

  // PR info (cached from GitHub)
  prInfo: prInfoSchema.optional(),
});

export type PRInfo = z.infer<typeof prInfoSchema>;
export type BranchMeta = z.infer<typeof branchMetaSchema>;

/**
 * Write metadata for a branch to refs/arr/<branchName>
 */
export function writeMetadata(
  branchName: string,
  meta: BranchMeta,
  cwd?: string,
): void {
  const json = JSON.stringify(meta);
  const objectId = runGitSync(["hash-object", "-w", "--stdin"], {
    input: json,
    cwd,
  });
  runGitSync(["update-ref", `${REFS_PREFIX}/${branchName}`, objectId], { cwd });
}

/**
 * Read metadata for a branch from refs/arr/<branchName>
 * Returns null if not tracked or metadata is invalid.
 */
export function readMetadata(
  branchName: string,
  cwd?: string,
): BranchMeta | null {
  const json = runGitSync(["cat-file", "-p", `${REFS_PREFIX}/${branchName}`], {
    cwd,
    onError: "ignore",
  });
  if (!json) return null;

  try {
    const parsed = branchMetaSchema.safeParse(JSON.parse(json));
    if (!parsed.success) return null;
    return parsed.data;
  } catch {
    return null;
  }
}

/**
 * Batch read metadata for multiple branches in a single git call.
 * Much faster than calling readMetadata() for each branch individually.
 */
export function readMetadataBatch(
  branches: Map<string, string>,
  cwd?: string,
): Map<string, BranchMeta> {
  const result = new Map<string, BranchMeta>();
  if (branches.size === 0) return result;

  // Build input: one object ID per line
  const objectIds = Array.from(branches.values());
  const input = objectIds.join("\n");

  // Run git cat-file --batch
  const output = runGitSync(["cat-file", "--batch"], {
    cwd,
    input,
    onError: "ignore",
  });

  if (!output) return result;

  // Parse batch output format:
  // <objectId> blob <size>
  // <content>
  // (blank line or next header)
  const branchNames = Array.from(branches.keys());
  const lines = output.split("\n");
  let lineIdx = 0;
  let branchIdx = 0;

  while (lineIdx < lines.length && branchIdx < branchNames.length) {
    const headerLine = lines[lineIdx];
    if (!headerLine || headerLine.includes("missing")) {
      // Object not found, skip this branch
      lineIdx++;
      branchIdx++;
      continue;
    }

    // Parse header: <objectId> <type> <size>
    const headerMatch = headerLine.match(/^([a-f0-9]+) (\w+) (\d+)$/);
    if (!headerMatch) {
      lineIdx++;
      branchIdx++;
      continue;
    }

    const size = parseInt(headerMatch[3], 10);
    lineIdx++; // Move past header

    // Read content (may span multiple lines)
    let content = "";
    let remaining = size;
    while (remaining > 0 && lineIdx < lines.length) {
      const line = lines[lineIdx];
      content += line;
      remaining -= line.length;
      lineIdx++;
      if (remaining > 0) {
        content += "\n";
        remaining -= 1; // Account for newline
      }
    }

    // Parse JSON and validate
    try {
      const parsed = branchMetaSchema.safeParse(JSON.parse(content));
      if (parsed.success) {
        result.set(branchNames[branchIdx], parsed.data);
      }
    } catch {
      // Invalid JSON, skip
    }

    branchIdx++;
  }

  return result;
}

/**
 * Delete metadata for a branch.
 */
export function deleteMetadata(branchName: string, cwd?: string): void {
  runGitSync(["update-ref", "-d", `${REFS_PREFIX}/${branchName}`], {
    cwd,
    onError: "ignore",
  });
}

/**
 * List all tracked branches with their metadata object IDs.
 * Returns a map of branchName -> objectId
 */
export function listTrackedBranches(cwd?: string): Map<string, string> {
  const result = new Map<string, string>();

  const lines = runGitSyncLines(
    [
      "for-each-ref",
      "--format=%(refname:lstrip=2):%(objectname)",
      `${REFS_PREFIX}/`,
    ],
    { cwd, onError: "ignore" },
  );

  for (const line of lines) {
    const [branchName, objectId] = line.split(":");
    if (branchName && objectId) {
      result.set(branchName, objectId);
    }
  }

  return result;
}

/**
 * Get all tracked branch names.
 */
export function getTrackedBranchNames(cwd?: string): string[] {
  return Array.from(listTrackedBranches(cwd).keys());
}

/**
 * Check if a branch is tracked by arr.
 */
export function isTracked(branchName: string, cwd?: string): boolean {
  const meta = readMetadata(branchName, cwd);
  return meta !== null;
}

/**
 * Update PR info for a tracked branch.
 * Preserves other metadata fields.
 */
export function updatePRInfo(
  branchName: string,
  prInfo: PRInfo,
  cwd?: string,
): void {
  const meta = readMetadata(branchName, cwd);
  if (!meta) {
    throw new Error(`Branch ${branchName} is not tracked by arr`);
  }
  writeMetadata(branchName, { ...meta, prInfo }, cwd);
}
