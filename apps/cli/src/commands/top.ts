import { top as coreTop } from "@array/core/commands/top";
import { printNavResult } from "../utils/output";
import { unwrap } from "../utils/run";

export async function top(): Promise<void> {
  printNavResult(unwrap(await coreTop()));
}
