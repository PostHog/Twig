import { runJJ, status } from "../jj";
import { createError, err, ok, type Result } from "../result";
import type { NavigationResult } from "../types";
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
      return getNavigationResult("parent");
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

  return getNavigationResult("parent");
}

async function getNavigationResult(
  target: "current" | "parent" = "current",
): Promise<Result<NavigationResult>> {
  if (target === "parent") {
    const result = await runJJ([
      "log",
      "-r",
      "@-",
      "--no-graph",
      "-T",
      'change_id.short() ++ "\\t" ++ change_id.shortest().prefix() ++ "\\t" ++ description.first_line()',
    ]);
    if (!result.ok) return result;
    const [changeId, changeIdPrefix, description] = result.value.stdout
      .trim()
      .split("\t");
    return ok({ changeId, changeIdPrefix, description: description || "" });
  }
  const statusResult = await status();
  if (!statusResult.ok) return statusResult;
  return ok({
    changeId: statusResult.value.workingCopy.changeId,
    changeIdPrefix: statusResult.value.workingCopy.changeIdPrefix,
    description: statusResult.value.workingCopy.description,
  });
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
