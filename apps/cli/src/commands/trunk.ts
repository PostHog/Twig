import { trunk as coreTrunk } from "@array/core/commands/trunk";
import { COMMANDS } from "../registry";
import { arr, cyan, green, hint, message } from "../utils/output";
import { unwrap } from "../utils/run";

export async function trunk(): Promise<void> {
  unwrap(await coreTrunk());
  message(`${green("◉")} Started fresh on ${cyan("main")}`);
  hint(`Run ${arr(COMMANDS.top)} to go back to your stack`);
}
