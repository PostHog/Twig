import { down as coreDown } from "@array/core/commands/down";
import { printNavResult } from "../utils/output";
import { unwrap } from "../utils/run";

export async function down(): Promise<void> {
  printNavResult(unwrap(await coreDown()));
}
