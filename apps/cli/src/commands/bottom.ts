import { bottom as coreBottom } from "@array/core/commands/bottom";
import { printNav } from "../utils/output";
import { unwrap } from "../utils/run";

export async function bottom(): Promise<void> {
  printNav("down", unwrap(await coreBottom()));
}
