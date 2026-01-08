import { down as coreDown } from "@array/core/commands/down";
import { COMMANDS } from "../registry";
import {
  arr,
  cyan,
  dim,
  formatChangeId,
  green,
  hint,
  message,
} from "../utils/output";
import { unwrap } from "../utils/run";

export async function down(): Promise<void> {
  const result = unwrap(await coreDown());

  if (result.createdOnTrunk) {
    message(`${green("◉")} Started fresh on ${cyan("main")}`);
    hint(`Run ${arr(COMMANDS.top)} to go back to your stack`);
  } else {
    const shortId = formatChangeId(
      result.changeId.slice(0, 8),
      result.changeIdPrefix,
    );
    const desc = result.description || dim("(empty)");
    message(`↓ ${green(desc)} ${shortId}`);
  }
}
