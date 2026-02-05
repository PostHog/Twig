import { EventEmitter } from "node:events";
import { logger } from "../../../lib/logger.js";
import type {
  CreateWorkspaceInput,
  ScriptExecutionResult,
  Workspace,
  WorkspaceInfo,
} from "../../workspace/schemas.js";
import {
  type WorkspaceService,
  WorkspaceServiceEvent,
} from "../../workspace/service.js";
import type { WorkspaceManager, WorkspaceManagerEvents } from "../types.js";

const log = logger.scope("local-workspace-manager");

export class LocalWorkspaceManager implements WorkspaceManager {
  constructor(private workspaceService: WorkspaceService) {}

  create(options: CreateWorkspaceInput): Promise<WorkspaceInfo> {
    return this.workspaceService.createWorkspace(options);
  }

  delete(taskId: string, mainRepoPath: string): Promise<void> {
    return this.workspaceService.deleteWorkspace(taskId, mainRepoPath);
  }

  verify(taskId: string): Promise<{ exists: boolean; missingPath?: string }> {
    return this.workspaceService.verifyWorkspaceExists(taskId);
  }

  getInfo(taskId: string): Promise<WorkspaceInfo | null> {
    return this.workspaceService.getWorkspaceInfo(taskId);
  }

  getAll(): Promise<Record<string, Workspace>> {
    return this.workspaceService.getAllWorkspaces();
  }

  async runScripts(
    taskId: string,
    scriptType: "init" | "start" | "destroy",
    worktreePath: string,
    worktreeName: string,
  ): Promise<ScriptExecutionResult> {
    if (scriptType === "start") {
      return this.workspaceService.runStartScripts(
        taskId,
        worktreePath,
        worktreeName,
      );
    }
    return { success: true, terminalSessionIds: [] };
  }

  isRunning(taskId: string): boolean {
    return this.workspaceService.isWorkspaceRunning(taskId);
  }

  on<K extends keyof WorkspaceManagerEvents>(
    event: K,
    listener: (payload: WorkspaceManagerEvents[K]) => void,
  ): void {
    const wsEvent = this.mapEventName(event);
    if (wsEvent) {
      this.workspaceService.on(wsEvent, listener as never);
    }
  }

  off<K extends keyof WorkspaceManagerEvents>(
    event: K,
    listener: (payload: WorkspaceManagerEvents[K]) => void,
  ): void {
    const wsEvent = this.mapEventName(event);
    if (wsEvent) {
      this.workspaceService.off(wsEvent, listener as never);
    }
  }

  private mapEventName(
    event: keyof WorkspaceManagerEvents,
  ): (typeof WorkspaceServiceEvent)[keyof typeof WorkspaceServiceEvent] | null {
    switch (event) {
      case "terminalCreated":
        return WorkspaceServiceEvent.TerminalCreated;
      case "error":
        return WorkspaceServiceEvent.Error;
      case "warning":
        return WorkspaceServiceEvent.Warning;
      case "branchChanged":
        return WorkspaceServiceEvent.BranchChanged;
      case "provisioningStatus":
        return null;
      default:
        return null;
    }
  }
}

export class CloudWorkspaceManager
  extends EventEmitter
  implements WorkspaceManager
{
  private provisioningStatuses = new Map<
    string,
    {
      status: "pending" | "provisioning" | "ready" | "error";
      sandboxUrl?: string;
    }
  >();

  async create(options: CreateWorkspaceInput): Promise<WorkspaceInfo> {
    log.info("CloudWorkspaceManager.create called", { taskId: options.taskId });

    this.provisioningStatuses.set(options.taskId, { status: "pending" });

    this.emit("provisioningStatus", {
      taskId: options.taskId,
      status: "pending",
      message: "Creating cloud workspace...",
    });

    return {
      taskId: options.taskId,
      mode: "cloud",
      worktree: null,
      branchName: null,
      terminalSessionIds: [],
      hasStartScripts: false,
    };
  }

  async delete(taskId: string, _mainRepoPath: string): Promise<void> {
    log.info("CloudWorkspaceManager.delete called", { taskId });
    this.provisioningStatuses.delete(taskId);
  }

  async verify(
    taskId: string,
  ): Promise<{ exists: boolean; missingPath?: string }> {
    const status = this.provisioningStatuses.get(taskId);
    return { exists: status !== undefined };
  }

  async getInfo(taskId: string): Promise<WorkspaceInfo | null> {
    const status = this.provisioningStatuses.get(taskId);
    if (!status) return null;

    return {
      taskId,
      mode: "cloud",
      worktree: null,
      branchName: null,
      terminalSessionIds: [],
      hasStartScripts: false,
    };
  }

  async getAll(): Promise<Record<string, Workspace>> {
    const result: Record<string, Workspace> = {};
    for (const taskId of this.provisioningStatuses.keys()) {
      result[taskId] = {
        taskId,
        folderId: "",
        folderPath: "",
        mode: "cloud",
        worktreePath: null,
        worktreeName: null,
        branchName: null,
        baseBranch: null,
        createdAt: new Date().toISOString(),
        terminalSessionIds: [],
        hasStartScripts: false,
      };
    }
    return result;
  }

  async runScripts(
    taskId: string,
    _scriptType: "init" | "start" | "destroy",
    _worktreePath: string,
    _worktreeName: string,
  ): Promise<ScriptExecutionResult> {
    log.info("CloudWorkspaceManager.runScripts called (no-op)", { taskId });
    return { success: true, terminalSessionIds: [] };
  }

  isRunning(_taskId: string): boolean {
    return false;
  }

  updateProvisioningStatus(
    taskId: string,
    status: "pending" | "provisioning" | "ready" | "error",
    message?: string,
    sandboxUrl?: string,
  ): void {
    this.provisioningStatuses.set(taskId, { status, sandboxUrl });
    this.emit("provisioningStatus", { taskId, status, message, sandboxUrl });
  }

  getSandboxUrl(taskId: string): string | undefined {
    return this.provisioningStatuses.get(taskId)?.sandboxUrl;
  }
}
