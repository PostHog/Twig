import { removeWorkspace } from "../jj/workspace";
import type { Result } from "../result";
import type { Command } from "./types";

export async function workspaceRemove(name: string): Promise<Result<void>> {
  return removeWorkspace(name);
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
