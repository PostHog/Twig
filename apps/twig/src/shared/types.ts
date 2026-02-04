import { z } from "zod";

// Execution mode schema and type - shared between main and renderer
export const executionModeSchema = z.enum([
  "default",
  "acceptEdits",
  "plan",
  "bypassPermissions",
]);
export type ExecutionMode = z.infer<typeof executionModeSchema>;

export const EXECUTION_MODES: ExecutionMode[] = [
  "default",
  "acceptEdits",
  "plan",
  "bypassPermissions",
];

export interface RegisteredFolder {
  id: string;
  path: string;
  name: string;
  lastAccessed: string;
  createdAt: string;
  exists?: boolean;
}

export type WorkspaceMode = "worktree" | "local" | "cloud";

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

export function getCapabilitiesForMode(
  mode: WorkspaceMode | EnvironmentType,
): EnvironmentCapabilities {
  return mode === "cloud" ? CLOUD_CAPABILITIES : LOCAL_CAPABILITIES;
}

interface TaskFolderAssociationBase {
  taskId: string;
  folderId: string;
}

export type TaskFolderAssociation =
  | (TaskFolderAssociationBase & { mode: "local" })
  | (TaskFolderAssociationBase & { mode: "cloud" })
  | (TaskFolderAssociationBase & {
      mode: "worktree";
      worktree: string;
      branchName: string;
    });

export interface ArrayConfig {
  scripts?: {
    init?: string | string[];
    start?: string | string[];
    destroy?: string | string[];
  };
}

export interface WorktreeInfo {
  worktreePath: string;
  worktreeName: string;
  branchName: string | null;
  baseBranch: string;
  createdAt: string;
}

export interface WorkspaceInfo {
  taskId: string;
  mode: WorkspaceMode;
  worktree: WorktreeInfo | null;
  branchName: string | null;
  terminalSessionIds: string[];
  hasStartScripts?: boolean;
}

export interface Workspace {
  taskId: string;
  folderId: string;
  folderPath: string;
  mode: WorkspaceMode;
  worktreePath: string | null;
  worktreeName: string | null;
  branchName: string | null;
  baseBranch: string | null;
  createdAt: string;
  terminalSessionIds: string[];
  hasStartScripts?: boolean;
}

export interface WorkspaceTerminalInfo {
  sessionId: string;
  scriptType: "init" | "start";
  command: string;
  label: string;
  status: "running" | "completed" | "failed";
  exitCode?: number;
}

export interface CreateWorkspaceOptions {
  taskId: string;
  mainRepoPath: string;
  folderId: string;
  folderPath: string;
  mode: WorkspaceMode;
  branch?: string;
  useExistingBranch?: boolean;
}

export interface ScriptExecutionResult {
  success: boolean;
  terminalSessionIds: string[];
  errors?: string[];
}

interface UserBasic {
  id: number;
  uuid: string;
  distinct_id?: string | null;
  first_name?: string;
  last_name?: string;
  email: string;
  is_email_verified?: boolean | null;
}

export interface Task {
  id: string;
  task_number: number | null;
  slug: string;
  title: string;
  description: string;
  created_at: string;
  updated_at: string;
  created_by?: UserBasic | null;
  origin_product: string;
  repository?: string | null; // Format: "organization/repository" (e.g., "posthog/posthog-js")
  github_integration?: number | null;
  json_schema?: Record<string, unknown> | null;
  latest_run?: TaskRun;
}

export interface TaskRun {
  id: string;
  task: string; // Task ID
  team: number;
  branch: string | null;
  stage?: string | null; // Current stage (e.g., 'research', 'plan', 'build')
  environment?: "local" | "cloud";
  status: "started" | "in_progress" | "completed" | "failed";
  log_url: string;
  error_message: string | null;
  output: Record<string, unknown> | null; // Structured output (PR URL, commit SHA, etc.)
  state: Record<string, unknown>; // Intermediate run state (defaults to {}, never null)
  created_at: string;
  updated_at: string;
  completed_at: string | null;
}

// Mention types for editors
type MentionType =
  | "file"
  | "error"
  | "experiment"
  | "insight"
  | "feature_flag"
  | "generic";

export interface MentionItem {
  // File items
  path?: string;
  name?: string;
  // URL items
  url?: string;
  type?: MentionType;
  label?: string;
  id?: string;
  urlId?: string;
}

export interface TaskArtifact {
  name: string;
  path: string;
  size: number;
  modifiedAt: string;
}

// Git file status types
export type GitFileStatus =
  | "modified"
  | "added"
  | "deleted"
  | "renamed"
  | "untracked";

export interface ChangedFile {
  path: string;
  status: GitFileStatus;
  originalPath?: string; // For renames: the old path
  linesAdded?: number;
  linesRemoved?: number;
}

// External apps detection types
export type ExternalAppType = "editor" | "terminal" | "file-manager";

export interface DetectedApplication {
  id: string; // "vscode", "cursor", "iterm"
  name: string; // "Visual Studio Code"
  type: ExternalAppType;
  path: string; // "/Applications/Visual Studio Code.app"
  command: string; // Launch command
  icon?: string; // Base64 data URL
}

export interface ExternalAppsPreferences {
  lastUsedApp?: string;
}
