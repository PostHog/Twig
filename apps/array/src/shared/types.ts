export interface RegisteredFolder {
  id: string;
  path: string;
  name: string;
  lastAccessed: string;
  createdAt: string;
}

export interface WorktreeInfo {
  worktreePath: string;
  worktreeName: string;
  branchName: string;
  baseBranch: string;
  createdAt: string;
}

export type WorkspaceMode = "worktree" | "root";

export interface TaskFolderAssociation {
  taskId: string;
  folderId: string;
  folderPath: string;
  mode: WorkspaceMode;
  worktree?: WorktreeInfo;
}

// Workspace types for array.json configuration
export interface ArrayConfig {
  scripts?: {
    init?: string | string[];
    start?: string | string[];
    destroy?: string | string[];
  };
}

export interface WorkspaceInfo {
  taskId: string;
  mode: WorkspaceMode;
  worktree: WorktreeInfo | null;
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

// URL mention types for RichTextEditor
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

// Plan Mode types
export type ExecutionMode = "plan";

export type PlanModePhase =
  | "idle"
  | "research"
  | "questions"
  | "planning"
  | "review";

export interface ClarifyingQuestion {
  id: string;
  question: string;
  options: string[]; // ["a) option1", "b) option2", "c) something else"]
  requiresInput: boolean; // true if option c or custom input needed
}

export interface QuestionAnswer {
  questionId: string;
  selectedOption: string;
  customInput?: string;
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
}

// External apps detection types
export type ExternalAppType = "editor" | "terminal";

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
