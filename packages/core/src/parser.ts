import { z } from "zod";
import { createError, err, ok, type Result } from "./result";
import type { ConflictInfo, FileChange } from "./types";

const BookmarkSchema = z.object({
  name: z.string(),
  target: z.array(z.string().nullable()).optional(),
});

const DiffStatsSchema = z.object({
  filesChanged: z.number(),
  insertions: z.number(),
  deletions: z.number(),
});

const ChangesetSchema = z
  .object({
    base: z.object({
      commit_id: z.string(),
      change_id: z.string(),
      description: z.string(),
      author: z.object({
        name: z.string(),
        email: z.string(),
        timestamp: z.string(),
      }),
    }),
    parentChangeIds: z.array(z.string()),
    empty: z.boolean(),
    conflict: z.boolean(),
    immutable: z.boolean(),
    workingCopy: z.boolean(),
    bookmarks: z.array(BookmarkSchema),
    changeIdPrefix: z.string(),
    commitIdPrefix: z.string(),
    diffStats: DiffStatsSchema.optional(),
  })
  .transform((raw) => ({
    changeId: raw.base.change_id.slice(0, 12),
    commitId: raw.base.commit_id.slice(0, 12),
    changeIdPrefix: raw.changeIdPrefix,
    commitIdPrefix: raw.commitIdPrefix,
    description: raw.base.description.split("\n")[0],
    author: { name: raw.base.author.name, email: raw.base.author.email },
    timestamp: new Date(raw.base.author.timestamp),
    parents: raw.parentChangeIds.map((p) => p.slice(0, 12)),
    isEmpty: raw.empty,
    hasConflicts: raw.conflict,
    isImmutable: raw.immutable,
    isWorkingCopy: raw.workingCopy,
    bookmarks: raw.bookmarks.map((b) => b.name.replace(/\*$/, "")),
    diffStats: raw.diffStats ?? null,
  }));

export type Changeset = z.output<typeof ChangesetSchema>;

export function parseChangesets(stdout: string): Result<Changeset[]> {
  try {
    const lines = stdout.trim().split("\n").filter(Boolean);
    return ok(lines.map((line) => ChangesetSchema.parse(JSON.parse(line))));
  } catch (e) {
    return err(createError("PARSE_ERROR", `Failed to parse jj output: ${e}`));
  }
}

export function parseFileChanges(stdout: string): Result<FileChange[]> {
  try {
    const lines = stdout.trim().split("\n").filter(Boolean);
    const changes: FileChange[] = [];

    for (const line of lines) {
      // Match status char followed by space(s) and path
      // Use non-backtracking approach: check first char, then split
      const firstChar = line[0];
      if (!"MADR".includes(firstChar)) continue;
      if (line[1] !== " " && line[1] !== "\t") continue;
      const path = line.slice(2).trim();
      if (!path) continue;

      const statusChar = firstChar;
      const statusMap: Record<string, FileChange["status"]> = {
        M: "modified",
        A: "added",
        D: "deleted",
        R: "renamed",
      };

      changes.push({
        path,
        status: statusMap[statusChar] ?? "modified",
      });
    }

    return ok(changes);
  } catch (e) {
    return err(
      createError("PARSE_ERROR", `Failed to parse file changes: ${e}`),
    );
  }
}

export function parseConflicts(stdout: string): Result<ConflictInfo[]> {
  try {
    const lines = stdout.trim().split("\n").filter(Boolean);
    const conflicts: ConflictInfo[] = [];

    for (const line of lines) {
      // Old format: "C path/to/file"
      if (line.startsWith("C ")) {
        conflicts.push({
          path: line.slice(2).trim(),
          type: "content",
        });
      }
      // New format: "path/to/file    2-sided conflict" or similar
      // Must start with a path (non-space) and contain "-sided conflict"
      // This excludes lines like "Working copy  (@) : xyz (conflict) ..."
      else if (line.includes("-sided conflict")) {
        // Extract path: everything before first whitespace
        const spaceIdx = line.search(/\s/);
        if (spaceIdx > 0) {
          const path = line.slice(0, spaceIdx);
          // Verify the rest contains the conflict marker
          if (line.slice(spaceIdx).includes("-sided conflict")) {
            conflicts.push({
              path,
              type: "content",
            });
          }
        }
      }
    }

    return ok(conflicts);
  } catch (e) {
    return err(createError("PARSE_ERROR", `Failed to parse conflicts: ${e}`));
  }
}

export function detectError(
  stderr: string,
): { code: string; message: string } | null {
  if (stderr.includes("There is no jj repo in")) {
    return { code: "NOT_IN_REPO", message: "Not in a jj repository" };
  }
  if (stderr.includes("Revision") && stderr.includes("doesn't exist")) {
    return { code: "INVALID_REVISION", message: "Invalid revision" };
  }
  if (stderr.includes("Workspace") && stderr.includes("doesn't exist")) {
    return { code: "WORKSPACE_NOT_FOUND", message: "Workspace not found" };
  }
  return null;
}
