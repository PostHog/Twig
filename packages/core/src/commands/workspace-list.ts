import { listWorkspaces, type WorkspaceInfo } from "../jj/workspace";
import type { Result } from "../result";
import type { Command } from "./types";

export async function workspaceList(): Promise<Result<WorkspaceInfo[]>> {
  return listWorkspaces();
}

export const workspaceListCommand: Command<WorkspaceInfo[], []> = {
  meta: {
    name: "workspace list",
    description: "List all agent workspaces",
    category: "management",
  },
  run: workspaceList,
};
