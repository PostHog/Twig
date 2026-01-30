import path from "node:path";
import type { WorkspaceMode } from "@shared/types";
import { getCurrentBranch, getDefaultBranch } from "@twig/git/queries";

export interface WorkspaceEnvContext {
  taskId: string;
  folderPath: string;
  worktreePath: string | null;
  worktreeName: string | null;
  mode: WorkspaceMode;
}

const PORT_BASE = 50000;
const PORTS_PER_WORKSPACE = 20;
const MAX_WORKSPACES = 1000;

function hashTaskId(taskId: string): number {
  let hash = 0;
  for (let i = 0; i < taskId.length; i++) {
    const char = taskId.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash;
  }
  return Math.abs(hash);
}

function allocateWorkspacePorts(taskId: string): {
  start: number;
  end: number;
  ports: number[];
} {
  const workspaceIndex = hashTaskId(taskId) % MAX_WORKSPACES;
  const start = PORT_BASE + workspaceIndex * PORTS_PER_WORKSPACE;
  const end = start + PORTS_PER_WORKSPACE - 1;

  const ports: number[] = [];
  for (let port = start; port <= end; port++) {
    ports.push(port);
  }

  return { start, end, ports };
}

export async function buildWorkspaceEnv(
  context: WorkspaceEnvContext,
): Promise<Record<string, string>> {
  if (context.mode === "cloud") {
    return {};
  }

  const workspaceName =
    context.worktreeName ?? path.basename(context.folderPath);
  const workspacePath = context.worktreePath ?? context.folderPath;
  const rootPath = context.folderPath;

  const defaultBranch = await getDefaultBranch(rootPath);

  const workspaceBranch = (await getCurrentBranch(workspacePath)) ?? "";

  const portAllocation = allocateWorkspacePorts(context.taskId);

  return {
    TWIG_WORKSPACE_NAME: workspaceName,
    TWIG_WORKSPACE_PATH: workspacePath,
    TWIG_ROOT_PATH: rootPath,
    TWIG_DEFAULT_BRANCH: defaultBranch,
    TWIG_WORKSPACE_BRANCH: workspaceBranch,
    TWIG_WORKSPACE_PORTS: portAllocation.ports.join(","),
    TWIG_WORKSPACE_PORTS_RANGE: String(PORTS_PER_WORKSPACE),
    TWIG_WORKSPACE_PORTS_START: String(portAllocation.start),
    TWIG_WORKSPACE_PORTS_END: String(portAllocation.end),
  };
}
