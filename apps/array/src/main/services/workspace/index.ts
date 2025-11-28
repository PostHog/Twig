import type { BrowserWindow } from "electron";
import type {
  CreateWorkspaceOptions,
  ScriptExecutionResult,
  Workspace,
  WorkspaceInfo,
  WorkspaceTerminalInfo,
} from "../../../shared/types";
import { createIpcHandler } from "../../lib/ipcHandler";
import { WorkspaceService } from "./workspaceService";

let workspaceService: WorkspaceService | null = null;

const handle = createIpcHandler("workspace");

function getService(): WorkspaceService {
  if (!workspaceService) {
    throw new Error("Workspace service not initialized");
  }
  return workspaceService;
}

export function registerWorkspaceIpc(
  getMainWindow: () => BrowserWindow | null,
): void {
  workspaceService = new WorkspaceService({ getMainWindow });

  handle<[CreateWorkspaceOptions], WorkspaceInfo>(
    "workspace:create",
    async (_event, options) => getService().createWorkspace(options),
  );

  handle<[string, string], void>(
    "workspace:delete",
    async (_event, taskId, mainRepoPath) =>
      getService().deleteWorkspace(taskId, mainRepoPath),
  );

  handle<[string], boolean>(
    "workspace:verify",
    async (_event, taskId) => getService().verifyWorkspaceExists(taskId),
    { rethrow: false, fallback: false },
  );

  handle<[string], WorkspaceInfo | null>(
    "workspace:get-info",
    (_event, taskId) => getService().getWorkspaceInfo(taskId),
    { rethrow: false, fallback: null },
  );

  handle<[string, string, string], ScriptExecutionResult>(
    "workspace:run-start",
    async (_event, taskId, worktreePath, worktreeName) =>
      getService().runStartScripts(taskId, worktreePath, worktreeName),
    {
      rethrow: false,
      fallback: { success: false, terminalSessionIds: [], errors: ["Failed"] },
    },
  );

  handle<[string], boolean>(
    "workspace:is-running",
    (_event, taskId) => workspaceService?.isWorkspaceRunning(taskId) ?? false,
    { rethrow: false, fallback: false },
  );

  handle<[string], WorkspaceTerminalInfo[]>(
    "workspace:get-terminals",
    (_event, taskId) => workspaceService?.getWorkspaceTerminals(taskId) ?? [],
    { rethrow: false, fallback: [] },
  );

  handle<[], Record<string, Workspace>>(
    "workspace:get-all",
    async () => workspaceService?.getAllWorkspaces() ?? {},
    { rethrow: false, fallback: {} },
  );
}

export { loadConfig, normalizeScripts } from "./configLoader";
export type { ArrayConfig, ConfigValidationResult } from "./configSchema";
export { arrayConfigSchema, validateConfig } from "./configSchema";
export { WorkspaceService } from "./workspaceService";
