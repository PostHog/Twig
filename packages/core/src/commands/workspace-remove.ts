import { removeWorkspace } from "../jj/workspace";
import type { Result } from "../result";
import { focusRemove, focusStatus } from "./focus";
import type { Command } from "./types";

export async function workspaceRemove(
  name: string,
  cwd = process.cwd(),
): Promise<Result<void>> {
  // If workspace is in focus, remove it from focus first
  const status = await focusStatus(cwd);
  if (
    status.ok &&
    status.value.isFocused &&
    status.value.workspaces.includes(name)
  ) {
    await focusRemove([name], cwd);
  }

  return removeWorkspace(name, cwd);
}

export const workspaceRemoveCommand: Command<void, [string]> = {
  meta: {
    name: "workspace remove",
    args: "<name>",
    description: "Remove an agent workspace",
    category: "management",
  },
  run: workspaceRemove,
};
