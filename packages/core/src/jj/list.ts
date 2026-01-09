import { type Changeset, parseChangesets } from "../parser";
import type { Result } from "../result";
import { CHANGESET_JSON_TEMPLATE } from "../templates";
import type { ListOptions } from "../types";
import { runJJ } from "./runner";

export async function list(
  options?: ListOptions,
  cwd = process.cwd(),
): Promise<Result<Changeset[]>> {
  const args = ["log", "--no-graph", "-T", CHANGESET_JSON_TEMPLATE];

  if (options?.revset) {
    args.push("-r", options.revset);
  }
  if (options?.limit) {
    args.push("-n", String(options.limit));
  }

  const result = await runJJ(args, cwd);
  if (!result.ok) return result;

  return parseChangesets(result.value.stdout);
}
