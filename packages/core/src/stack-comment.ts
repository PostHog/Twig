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
  lines.push("**Merge order:** bottom → top, or use `arr merge`");
  lines.push("");
  lines.push("*Managed by [Array](https://github.com/posthog/array)*");

  return lines.join("\n");
}

export function mapReviewDecisionToStatus(
  reviewDecision: "approved" | "changes_requested" | "review_required" | null,
  state: "open" | "closed" | "merged",
): StackEntryStatus {
  if (state === "merged") return "merged";
  if (state === "closed") return "closed";
  if (reviewDecision === "approved") return "approved";
  return "waiting";
}
