import { parseConflicts } from "../parser";
import { ok, type Result } from "../result";
import type { ChangesetStatus, FileChange } from "../types";
import { runJJ } from "./runner";

// Single template that gets all status info in one jj call
// Diff summary is multi-line, so we put markers around it: DIFF_START and END_CHANGE
const STATUS_TEMPLATE = [
  '"CHANGE:"',
  "change_id.short()",
  '"|"',
  "change_id.shortest().prefix()",
  '"|"',
  'if(current_working_copy, "wc", "")',
  '"|"',
  'bookmarks.join(",")',
  '"|"',
  "description.first_line()",
  '"|"',
  'if(conflict, "1", "0")',
  '"|"',
  'if(empty, "1", "0")',
  '"\\nDIFF_START\\n"',
  "self.diff().summary()",
  '"END_CHANGE\\n"',
].join(" ++ ");

interface ParsedChange {
  changeId: string;
  changeIdPrefix: string;
  isWorkingCopy: boolean;
  bookmarks: string[];
  description: string;
  hasConflicts: boolean;
  isEmpty: boolean;
  diffSummary: string;
}

function parseModifiedFiles(diffSummary: string): FileChange[] {
  if (!diffSummary.trim()) return [];

  return diffSummary
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const status = line[0];
      const path = line.slice(2).trim();
      const statusMap: Record<string, FileChange["status"]> = {
        M: "modified",
        A: "added",
        D: "deleted",
        R: "renamed",
        C: "copied",
      };
      return { path, status: statusMap[status] || "modified" };
    });
}

/**
 * Get working copy status in a single jj call.
 */
export async function status(
  cwd = process.cwd(),
): Promise<Result<ChangesetStatus>> {
  // Single jj call with template - gets WC, parent, and grandparent for stack path
  const result = await runJJ(
    ["log", "-r", "@ | @- | @--", "--no-graph", "-T", STATUS_TEMPLATE],
    cwd,
  );

  if (!result.ok) return result;

  // Split by END_CHANGE marker to handle multi-line diff summaries
  const blocks = result.value.stdout.split("END_CHANGE").filter(Boolean);
  const changes = blocks
    .map((block) => {
      // Split block into metadata and diff parts using DIFF_START marker
      const [metaPart, diffPart] = block.split("DIFF_START");
      if (!metaPart) return null;

      const changeLine = metaPart.trim();
      if (!changeLine.startsWith("CHANGE:")) return null;

      const data = changeLine.slice(7);
      const parts = data.split("|");

      return {
        changeId: parts[0] || "",
        changeIdPrefix: parts[1] || "",
        isWorkingCopy: parts[2] === "wc",
        bookmarks: (parts[3] || "").split(",").filter(Boolean),
        description: parts[4] || "",
        hasConflicts: parts[5] === "1",
        isEmpty: parts[6] === "1",
        diffSummary: diffPart?.trim() || "",
      };
    })
    .filter(Boolean) as ParsedChange[];

  const workingCopy = changes.find((c) => c.isWorkingCopy);
  const parent = changes.find((c) => !c.isWorkingCopy);

  // For hasResolvedConflict, we still need jj status output
  // But only if parent has conflicts - otherwise skip it
  let hasResolvedConflict = false;
  if (parent?.hasConflicts) {
    const statusResult = await runJJ(["status"], cwd);
    if (statusResult.ok) {
      hasResolvedConflict = statusResult.value.stdout.includes(
        "Conflict in parent commit has been resolved in working copy",
      );
    }
  }

  // Parse conflicts from jj status if there are any
  let conflicts: { path: string; type: "content" | "delete" | "rename" }[] = [];
  if (workingCopy?.hasConflicts || parent?.hasConflicts) {
    const statusResult = await runJJ(["status"], cwd);
    if (statusResult.ok) {
      const parsed = parseConflicts(statusResult.value.stdout);
      if (parsed.ok) conflicts = parsed.value;
    }
  }

  return ok({
    workingCopy: workingCopy
      ? {
          changeId: workingCopy.changeId,
          changeIdPrefix: workingCopy.changeIdPrefix,
          commitId: "",
          commitIdPrefix: "",
          description: workingCopy.description,
          bookmarks: workingCopy.bookmarks,
          parents: parent ? [parent.changeId] : [],
          isWorkingCopy: true,
          isImmutable: false,
          isEmpty: workingCopy.isEmpty,
          hasConflicts: workingCopy.hasConflicts,
        }
      : {
          changeId: "",
          changeIdPrefix: "",
          commitId: "",
          commitIdPrefix: "",
          description: "",
          bookmarks: [],
          parents: [],
          isWorkingCopy: true,
          isImmutable: false,
          isEmpty: true,
          hasConflicts: false,
        },
    parents: parent
      ? [
          {
            changeId: parent.changeId,
            changeIdPrefix: parent.changeIdPrefix,
            commitId: "",
            commitIdPrefix: "",
            description: parent.description,
            bookmarks: parent.bookmarks,
            parents: [],
            isWorkingCopy: false,
            isImmutable: false,
            isEmpty: parent.isEmpty,
            hasConflicts: parent.hasConflicts,
          },
        ]
      : [],
    modifiedFiles: workingCopy
      ? parseModifiedFiles(workingCopy.diffSummary)
      : [],
    conflicts,
    hasResolvedConflict,
  });
}
