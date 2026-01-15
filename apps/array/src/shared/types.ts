export interface RegisteredFolder {
  id: string;
  path: string;
  name: string;
  lastAccessed: string;
  createdAt: string;
  exists?: boolean;
}

// Workspace types for array.json configuration
export interface ArrayConfig {
  scripts?: {
    init?: string | string[];
    start?: string | string[];
    destroy?: string | string[];
  };
}

// Simplified workspace types for jj workspaces
export interface WorkspaceInfo {
  taskId: string;
  workspaceName: string;
  workspacePath: string;
  repoPath: string;
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
  taskTitle: string;
  repoPath: string;
  folderId: string;
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

// JJ Workspace types (from @array/core)

/** Info about a jj workspace (from listWorkspaces) */
export interface JJWorkspaceInfo {
  name: string;
  path: string;
  changeId: string;
  isStale: boolean;
}

/** File change in a workspace */
export interface JJFileChange {
  status: "M" | "A" | "D" | "R";
  path: string;
}

/** Diff stats for a workspace */
export interface JJDiffStats {
  added: number;
  removed: number;
  files: number;
}

/** Status of a workspace (files and stats) */
export interface JJWorkspaceStatus {
  name: string;
  changes: JJFileChange[];
  stats: JJDiffStats;
}

/** Conflict info - file modified by multiple workspaces */
export interface JJConflictInfo {
  file: string;
  workspaces: string[];
}

/** Focus status - which workspaces are currently focused/merged */
export interface JJFocusStatus {
  isFocused: boolean;
  workspaces: string[];
  allWorkspaces: JJWorkspaceInfo[];
  conflicts: JJConflictInfo[];
}

/** Daemon status */
export interface DaemonStatus {
  running: boolean;
  pid?: number;
  repos?: Array<{ path: string; workspaces: string[] }>;
}
