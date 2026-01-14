export type StackEntryStatus =
  | "this"
  | "waiting"
  | "approved"
  | "merged"
  | "closed";

export interface StackEntry {
  prNumber: number;
  title: string;
  status: StackEntryStatus;
}

export interface StackCommentOptions {
  stack: StackEntry[];
}

export function generateStackComment(options: StackCommentOptions): string {
  const { stack } = options;

  const lines: string[] = [];

  // Stack should be displayed top-to-bottom (newest first, closest to main last)
  // Reverse the array since it comes in bottom-to-top order from submit
  const topToBottom = [...stack].reverse();

  for (const entry of topToBottom) {
    const pointer = entry.status === "this" ? " 👈" : "";
    lines.push(`* **#${entry.prNumber}** ${entry.title}${pointer}`);
  }

  lines.push("* `main`");
  lines.push("");
  lines.push("---");
  lines.push("");
  lines.push("Merge from bottom to top, or use `arr merge`");

  return lines.join("\n");
}

export function mapReviewDecisionToStatus(
  reviewDecision: "APPROVED" | "CHANGES_REQUESTED" | "REVIEW_REQUIRED" | null,
  state: "OPEN" | "CLOSED" | "MERGED",
): StackEntryStatus {
  if (state === "MERGED") return "merged";
  if (state === "CLOSED") return "closed";
  if (reviewDecision === "APPROVED") return "approved";
  return "waiting";
}
