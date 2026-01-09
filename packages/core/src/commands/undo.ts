import { runJJ } from "../jj";
import { ok, type Result } from "../result";
import type { Command } from "./types";

/**
 * Undo the last jj operation.
 */
export async function undo(): Promise<Result<void>> {
  const result = await runJJ(["undo"]);
  if (!result.ok) return result;
  return ok(undefined);
}

export const undoCommand: Command<void> = {
  meta: {
    name: "undo",
    description: "Undo the last jj operation",
    category: "management",
    core: true,
  },
  run: undo,
};
