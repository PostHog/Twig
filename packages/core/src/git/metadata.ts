import { z } from "zod";
import { REFS_PREFIX, runGitSync, runGitSyncLines } from "./runner";

const prInfoSchema = z.object({
  number: z.number(),
  url: z.string(),
  state: z.enum(["OPEN", "CLOSED", "MERGED"]),
  base: z.string(),
  title: z.string().optional(),
  body: z.string().optional(),
  reviewDecision: z
    .enum(["APPROVED", "REVIEW_REQUIRED", "CHANGES_REQUESTED"])
    .optional(),
  isDraft: z.boolean().optional(),
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
