import { up as coreUp } from "@array/core/commands/up";
import { printNav } from "../utils/output";
import { unwrap } from "../utils/run";

export async function up(): Promise<void> {
  printNav("up", unwrap(await coreUp()));
}
