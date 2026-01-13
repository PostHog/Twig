import { addWorkspace, type WorkspaceInfo } from "../jj/workspace";
import type { Result } from "../result";
import type { Command } from "./types";

export async function workspaceAdd(
  name: string,
): Promise<Result<WorkspaceInfo>> {
  return addWorkspace(name);
}

export const workspaceAddCommand: Command<WorkspaceInfo, [string]> = {
  meta: {
    name: "workspace add",
    args: "<name>",
    description: "Create a new agent workspace",
    category: "management",
  },
  run: workspaceAdd,
};
