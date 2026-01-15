import {
  type AddWorkspaceOptions,
  addWorkspace,
  type WorkspaceInfo,
} from "../jj/workspace";
import type { Result } from "../result";
import { focusAdd } from "./focus";
import type { Command } from "./types";

export async function workspaceAdd(
  name: string,
  cwd = process.cwd(),
  options: AddWorkspaceOptions = {},
): Promise<Result<WorkspaceInfo>> {
  const result = await addWorkspace(name, cwd, options);
  if (!result.ok) return result;

  // Automatically add new workspace to focus
  await focusAdd([name], cwd);

  return result;
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
