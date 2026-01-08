import { top as coreTop } from "@array/core/commands/top";
import { printNav } from "../utils/output";
import { unwrap } from "../utils/run";

export async function top(): Promise<void> {
  printNav("up", unwrap(await coreTop()));
}
