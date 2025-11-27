export interface RepositoryConfig {
  organization: string;
  repository: string;
}

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

export interface TaskFolderAssociation {
  taskId: string;
  folderId: string;
  folderPath: string;
  worktree?: WorktreeInfo;
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
  status?: string;
  repository_config?: RepositoryConfig;
  tags?: string[];

  // DEPRECATED: These fields have been moved to TaskRun
  github_branch?: string | null;
  github_pr_url?: string | null;
  latest_run?: TaskRun;
}

export interface LogEntry {
  type: string; // e.g., "info", "warning", "error", "success", "debug"
  message: string;
  [key: string]: unknown; // Allow additional fields
}

export interface TaskRun {
  id: string;
  task: string; // Task ID
  team: number;
  branch: string | null;
  status: "started" | "in_progress" | "completed" | "failed";
  log_url?: string;
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
