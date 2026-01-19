import { bottom as coreBottom } from "@twig/core/commands/bottom";
import { printNavResult } from "../utils/output";
import { unwrap } from "../utils/run";

export async function bottom(): Promise<void> {
  printNavResult(unwrap(await coreBottom()));
}
