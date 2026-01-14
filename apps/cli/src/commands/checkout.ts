import { checkout as checkoutCmd } from "@array/core/commands/checkout";
import { printNavResult } from "../utils/output";
import { requireArg, unwrap } from "../utils/run";

export async function checkout(id: string): Promise<void> {
  requireArg(id, "Usage: arr checkout <id>");
  printNavResult(unwrap(await checkoutCmd(id)));
}
