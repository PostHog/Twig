import { runJJ } from "../jj";
import { createError, err, type Result } from "../result";
import type { NavigationResult } from "../types";
import { getParentNavigationResult } from "./navigation";
import type { Command } from "./types";

/**
 * Navigate to the top of the current stack.
 * Creates a new empty change at the top for new work.
 */
export async function top(): Promise<Result<NavigationResult>> {
  // Check if @ is empty, undescribed, and has no children (already at top ready for work)
  const [wcResult, childrenResult] = await Promise.all([
    runJJ([
      "log",
      "-r",
      "@",
      "--no-graph",
      "-T",
      'empty ++ "\\t" ++ description.first_line()',
    ]),
    runJJ(["log", "-r", "@+", "--no-graph", "-T", "change_id.short()"]),
  ]);

  if (wcResult.ok && childrenResult.ok) {
    const [empty, desc = ""] = wcResult.value.stdout.trim().split("\t");
    const hasChildren = childrenResult.value.stdout.trim() !== "";
    if (empty === "true" && desc === "" && !hasChildren) {
      return getParentNavigationResult();
    }
  }

  // Navigate to the head of the stack
  const editResult = await runJJ(["edit", "heads(descendants(@))"]);
  if (!editResult.ok) {
    if (editResult.error.message.includes("more than one revision")) {
      return err(
        createError(
          "NAVIGATION_FAILED",
          "Stack has multiple heads - cannot determine top",
        ),
      );
    }
    if (!editResult.error.message.includes("No descendant")) {
      return editResult;
    }
    // "No descendant" means already at head - fall through to create empty @
  }

  // Create a new empty change above the head for new work
  const newResult = await runJJ(["new"]);
  if (!newResult.ok) return newResult;

  return getParentNavigationResult();
}

export const topCommand: Command<NavigationResult> = {
  meta: {
    name: "top",
    description: "Switch to the tip of the current stack",
    aliases: ["t"],
    category: "navigation",
  },
  run: top,
};
