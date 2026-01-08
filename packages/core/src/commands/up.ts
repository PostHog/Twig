import { jjNew, runJJ, status } from "../jj";
import { createError, err, type Result } from "../result";
import type { NavigationResult } from "../types";
import { getNavigationResult } from "./navigation";
import type { Command } from "./types";

export async function up(): Promise<Result<NavigationResult>> {
  // First check if we're on an undescribed working copy
  const statusResult = await status();
  if (!statusResult.ok) return statusResult;

  const wc = statusResult.value.workingCopy;
  const isUndescribed = wc.description.trim() === "";
  const hasChanges = !wc.isEmpty;

  if (isUndescribed) {
    if (hasChanges) {
      return err(
        createError(
          "NAVIGATION_FAILED",
          'You have unsaved changes. Run `arr create "message"` to save them.',
        ),
      );
    }
    return err(
      createError(
        "NAVIGATION_FAILED",
        'No changes yet. Edit files, then run `arr create "message"`.',
      ),
    );
  }

  // Try normal navigation
  const result = await runJJ(["next", "--edit"]);
  if (!result.ok) {
    if (result.error.message.includes("No descendant")) {
      // At top of stack - create new empty WC
      const newResult = await jjNew();
      if (!newResult.ok) return newResult;
      return getNavigationResult();
    }
    if (result.error.message.includes("ambiguous")) {
      return err(
        createError(
          "NAVIGATION_FAILED",
          "Multiple children - navigation is ambiguous",
        ),
      );
    }
    return result;
  }
  return getNavigationResult();
}

export const upCommand: Command<NavigationResult> = {
  meta: {
    name: "up",
    description: "Switch to the child of the current change",
    aliases: ["u"],
    category: "navigation",
    core: true,
  },
  run: up,
};
