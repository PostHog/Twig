import { resolve as coreResolve } from "@array/core/commands/resolve";
import { green, message } from "../utils/output";
import { unwrap } from "../utils/run";

export async function resolve(): Promise<void> {
  const result = unwrap(await coreResolve());
  const label =
    result.bookmark || result.description || result.changeId.slice(0, 8);
  message(`Resolved conflicts in ${green(label)}`);
}
