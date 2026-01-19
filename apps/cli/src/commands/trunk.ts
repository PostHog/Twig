import { trunk as coreTrunk } from "@twig/core/commands/trunk";
import { printNavResult } from "../utils/output";
import { unwrap } from "../utils/run";

export async function trunk(): Promise<void> {
  printNavResult(unwrap(await coreTrunk()));
}
