import { modify as coreModify } from "@array/core/commands/modify";
import { green, message } from "../utils/output";
import { unwrap } from "../utils/run";

export async function modify(): Promise<void> {
  const result = unwrap(await coreModify());
  const label =
    result.bookmark || result.description || result.changeId.slice(0, 8);
  message(`Modified ${green(label)}`);
}
