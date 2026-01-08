import { up as coreUp } from "@array/core/commands/up";
import { printNavResult } from "../utils/output";
import { unwrap } from "../utils/run";

export async function up(): Promise<void> {
  printNavResult(unwrap(await coreUp()));
}
