import { trunk as coreTrunk } from "@array/core/commands/trunk";
import { printNavResult } from "../utils/output";
import { unwrap } from "../utils/run";

export async function trunk(): Promise<void> {
  printNavResult(unwrap(await coreTrunk()));
}
