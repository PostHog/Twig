// Analytics event types and properties

export type ExecutionType = "cloud" | "local";
export type ExecutionMode = "plan" | "execute";
export type RepositoryProvider = "github" | "gitlab" | "local" | "none";
export type TaskCreatedFrom = "cli" | "command-menu";
export type RepositorySelectSource = "task-creation" | "task-detail";
export type GitActionType =
  | "push"
  | "pull"
  | "sync"
  | "publish"
  | "commit-push"
  | "create-pr";
export type FileOpenSource = "sidebar" | "agent-suggestion" | "search" | "diff";
export type FileChangeType = "added" | "modified" | "deleted";
export type StopReason = "user_cancelled" | "completed" | "error" | "timeout";
export type CommandMenuAction =
  | "home"
  | "new-task"
  | "settings"
  | "logout"
  | "toggle-theme"
  | "toggle-left-sidebar"
  | "toggle-right-sidebar";

// Event property interfaces
export interface TaskListViewProperties {
  filter_type?: string;
  sort_field?: string;
  view_mode?: string;
}

export interface TaskCreateProperties {
  auto_run: boolean;
  created_from: TaskCreatedFrom;
  repository_provider?: RepositoryProvider;
}

export interface TaskViewProperties {
  task_id: string;
}

export interface TaskRunProperties {
  task_id: string;
  execution_type: ExecutionType;
}

export interface RepositorySelectProperties {
  repository_provider: RepositoryProvider;
  source: RepositorySelectSource;
}

export interface UserIdentifyProperties {
  email?: string;
  uuid?: string;
  project_id?: string;
  region?: string;
}
export interface TaskRunStartedProperties {
  task_id: string;
  execution_type: ExecutionType;
  model?: string;
}

export interface TaskRunCompletedProperties {
  task_id: string;
  execution_type: ExecutionType;
  duration_seconds: number;
  prompts_sent: number;
  stop_reason: StopReason;
}

export interface TaskRunCancelledProperties {
  task_id: string;
  execution_type: ExecutionType;
  duration_seconds: number;
  prompts_sent: number;
}

export interface PromptSentProperties {
  task_id: string;
  is_initial: boolean;
  execution_type: ExecutionType;
  prompt_length_chars: number;
}

// Git operations
export interface GitActionExecutedProperties {
  action_type: GitActionType;
  success: boolean;
  task_id?: string;
}

export interface PrCreatedProperties {
  task_id?: string;
  success: boolean;
}

// File interactions
export interface FileOpenedProperties {
  file_extension: string;
  source: FileOpenSource;
  task_id?: string;
}

export interface FileDiffViewedProperties {
  file_extension: string;
  change_type: FileChangeType;
  task_id?: string;
}

// Workspace events
export interface WorkspaceCreatedProperties {
  task_id: string;
  mode: "cloud" | "worktree" | "local";
}

export interface WorkspaceScriptsStartedProperties {
  task_id: string;
  scripts_count: number;
}

export interface FolderRegisteredProperties {
  path_hash: string;
}

// Navigation events
export interface CommandMenuActionProperties {
  action_type: CommandMenuAction;
}

// Settings events
export interface SettingChangedProperties {
  setting_name: string;
  new_value: string | boolean | number;
  old_value?: string | boolean | number;
}

// Error events
export interface TaskCreationFailedProperties {
  error_type: string;
  failed_step?: string;
}

export interface AgentSessionErrorProperties {
  task_id: string;
  error_type: string;
}

// Activation events
export interface FirstTaskCreatedProperties {
  task_id: string;
}

export interface FirstTaskCompletedProperties {
  task_id: string;
  duration_seconds: number;
}

// Event names as constants
export const ANALYTICS_EVENTS = {
  // App lifecycle
  APP_STARTED: "App started",
  APP_QUIT: "App quit",

  // Authentication
  USER_LOGGED_IN: "User logged in",
  USER_LOGGED_OUT: "User logged out",

  // Task management
  TASK_LIST_VIEWED: "Task list viewed",
  TASK_CREATED: "Task created",
  TASK_VIEWED: "Task viewed",
  TASK_RUN: "Task run",
  TASK_RUN_STARTED: "Task run started",
  TASK_RUN_COMPLETED: "Task run completed",
  TASK_RUN_CANCELLED: "Task run cancelled",
  PROMPT_SENT: "Prompt sent",

  // Repository
  REPOSITORY_SELECTED: "Repository selected",

  // Git operations
  GIT_ACTION_EXECUTED: "Git action executed",
  PR_CREATED: "PR created",

  // File interactions
  FILE_OPENED: "File opened",
  FILE_DIFF_VIEWED: "File diff viewed",

  // Workspace events
  WORKSPACE_CREATED: "Workspace created",
  WORKSPACE_SCRIPTS_STARTED: "Workspace scripts started",
  FOLDER_REGISTERED: "Folder registered",

  // Navigation events
  SETTINGS_VIEWED: "Settings viewed",
  COMMAND_MENU_OPENED: "Command menu opened",
  COMMAND_MENU_ACTION: "Command menu action",

  // Settings events
  SETTING_CHANGED: "Setting changed",

  // Error events
  TASK_CREATION_FAILED: "Task creation failed",
  AGENT_SESSION_ERROR: "Agent session error",
} as const;

export type AnalyticsEvent =
  (typeof ANALYTICS_EVENTS)[keyof typeof ANALYTICS_EVENTS];

// Event property mapping
export type EventPropertyMap = {
  [ANALYTICS_EVENTS.TASK_LIST_VIEWED]: TaskListViewProperties | undefined;
  [ANALYTICS_EVENTS.TASK_CREATED]: TaskCreateProperties;
  [ANALYTICS_EVENTS.TASK_VIEWED]: TaskViewProperties;
  [ANALYTICS_EVENTS.TASK_RUN]: TaskRunProperties;
  [ANALYTICS_EVENTS.REPOSITORY_SELECTED]: RepositorySelectProperties;
  [ANALYTICS_EVENTS.USER_LOGGED_IN]: UserIdentifyProperties | undefined;
  [ANALYTICS_EVENTS.USER_LOGGED_OUT]: never;

  // Task execution events
  [ANALYTICS_EVENTS.TASK_RUN_STARTED]: TaskRunStartedProperties;
  [ANALYTICS_EVENTS.TASK_RUN_COMPLETED]: TaskRunCompletedProperties;
  [ANALYTICS_EVENTS.TASK_RUN_CANCELLED]: TaskRunCancelledProperties;
  [ANALYTICS_EVENTS.PROMPT_SENT]: PromptSentProperties;

  // Git operations
  [ANALYTICS_EVENTS.GIT_ACTION_EXECUTED]: GitActionExecutedProperties;
  [ANALYTICS_EVENTS.PR_CREATED]: PrCreatedProperties;

  // File interactions
  [ANALYTICS_EVENTS.FILE_OPENED]: FileOpenedProperties;
  [ANALYTICS_EVENTS.FILE_DIFF_VIEWED]: FileDiffViewedProperties;

  // Workspace events
  [ANALYTICS_EVENTS.WORKSPACE_CREATED]: WorkspaceCreatedProperties;
  [ANALYTICS_EVENTS.WORKSPACE_SCRIPTS_STARTED]: WorkspaceScriptsStartedProperties;
  [ANALYTICS_EVENTS.FOLDER_REGISTERED]: FolderRegisteredProperties;

  // Navigation events
  [ANALYTICS_EVENTS.SETTINGS_VIEWED]: never;
  [ANALYTICS_EVENTS.COMMAND_MENU_OPENED]: never;
  [ANALYTICS_EVENTS.COMMAND_MENU_ACTION]: CommandMenuActionProperties;

  // Settings events
  [ANALYTICS_EVENTS.SETTING_CHANGED]: SettingChangedProperties;

  // Error events
  [ANALYTICS_EVENTS.TASK_CREATION_FAILED]: TaskCreationFailedProperties;
  [ANALYTICS_EVENTS.AGENT_SESSION_ERROR]: AgentSessionErrorProperties;
};
