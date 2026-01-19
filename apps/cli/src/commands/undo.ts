import { undo as coreUndo } from "@twig/core/commands/undo";
import { formatSuccess, message } from "../utils/output";
import { unwrap } from "../utils/run";

export async function undo(): Promise<void> {
  unwrap(await coreUndo());
  message(formatSuccess("Undone last operation"));
}
