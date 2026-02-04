import type { DirectoryEntry } from "../file-watcher/schemas.js";
import type { ChangedFile, DetectRepoResult } from "../git/schemas.js";
import type { ExecuteOutput } from "../shell/schemas.js";
import type {
  CreateWorkspaceInput,
  ScriptExecutionResult,
  Workspace,
  WorkspaceInfo,
} from "../workspace/schemas.js";

export type EnvironmentType = "local" | "cloud";

export interface EnvironmentCapabilities {
  shell: boolean;
  files: boolean;
  git: boolean;
  workspace: boolean;
  scripts: boolean;
}

export const LOCAL_CAPABILITIES: EnvironmentCapabilities = {
  shell: true,
  files: true,
  git: true,
  workspace: true,
  scripts: true,
};

export const CLOUD_CAPABILITIES: EnvironmentCapabilities = {
  shell: false,
  files: false,
  git: false,
  workspace: true,
  scripts: false,
};

export interface ShellManagerEvents {
  data: { sessionId: string; data: string };
  exit: { sessionId: string; exitCode: number };
}

export interface ShellManager {
  create(sessionId: string, cwd: string, taskId?: string): Promise<void>;
  write(sessionId: string, data: string): void;
  resize(sessionId: string, cols: number, rows: number): void;
  destroy(sessionId: string): void;
  destroyByPrefix(prefix: string): void;
  execute(cwd: string, command: string): Promise<ExecuteOutput>;
  hasSession(sessionId: string): boolean;
  getSessionsByPrefix(prefix: string): string[];
  getTaskEnv(
    taskId: string,
    cwd?: string,
  ): Promise<Record<string, string> | undefined>;
  on<K extends keyof ShellManagerEvents>(
    event: K,
    listener: (payload: ShellManagerEvents[K]) => void,
  ): void;
  off<K extends keyof ShellManagerEvents>(
    event: K,
    listener: (payload: ShellManagerEvents[K]) => void,
  ): void;
}

export interface WorkspaceManagerEvents {
  terminalCreated: {
    taskId: string;
    sessionId: string;
    scriptType: "init" | "start";
    command: string;
    label: string;
  };
  error: { taskId: string; message: string };
  warning: { taskId: string; title: string; message: string };
  branchChanged: { taskId: string; branchName: string | null };
  provisioningStatus: {
    taskId: string;
    status: "pending" | "provisioning" | "ready" | "error";
    message?: string;
    sandboxUrl?: string;
  };
}

export interface WorkspaceManager {
  create(options: CreateWorkspaceInput): Promise<WorkspaceInfo>;
  delete(taskId: string, mainRepoPath: string): Promise<void>;
  verify(taskId: string): Promise<{ exists: boolean; missingPath?: string }>;
  getInfo(taskId: string): Promise<WorkspaceInfo | null>;
  getAll(): Promise<Record<string, Workspace>>;
  runScripts(
    taskId: string,
    scriptType: "init" | "start" | "destroy",
    worktreePath: string,
    worktreeName: string,
  ): Promise<ScriptExecutionResult>;
  isRunning(taskId: string): boolean;
  on<K extends keyof WorkspaceManagerEvents>(
    event: K,
    listener: (payload: WorkspaceManagerEvents[K]) => void,
  ): void;
  off<K extends keyof WorkspaceManagerEvents>(
    event: K,
    listener: (payload: WorkspaceManagerEvents[K]) => void,
  ): void;
}

export interface FilesManagerEvents {
  fileChanged: { repoPath: string; filePath: string };
  fileDeleted: { repoPath: string; filePath: string };
  directoryChanged: { repoPath: string; dirPath: string };
  gitStateChanged: { repoPath: string };
}

export interface FileEntry {
  path: string;
  name: string;
  changed: boolean;
}

export interface FilesManager {
  list(dirPath: string): Promise<DirectoryEntry[]>;
  listRepoFiles(
    repoPath: string,
    query?: string,
    limit?: number,
  ): Promise<FileEntry[]>;
  read(repoPath: string, filePath: string): Promise<string | null>;
  write(repoPath: string, filePath: string, content: string): Promise<void>;
  startWatching(repoPath: string): Promise<void>;
  stopWatching(repoPath: string): Promise<void>;
  on<K extends keyof FilesManagerEvents>(
    event: K,
    listener: (payload: FilesManagerEvents[K]) => void,
  ): void;
  off<K extends keyof FilesManagerEvents>(
    event: K,
    listener: (payload: FilesManagerEvents[K]) => void,
  ): void;
}

export interface GitManager {
  detectRepo(dirPath: string): Promise<DetectRepoResult | null>;
  getChangedFiles(repoPath: string): Promise<ChangedFile[]>;
  getCurrentBranch(repoPath: string): Promise<string | null>;
  getBranches(repoPath: string): Promise<string[]>;
  getDefaultBranch(repoPath: string): Promise<string>;
}
