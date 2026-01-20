import { z } from "zod";

// Base schemas
// Note: "root" is deprecated, migrated to "local" on read
export const workspaceModeSchema = z
  .enum(["worktree", "local", "cloud", "root"])
  .transform((val) => (val === "root" ? "local" : val));
export const branchOwnershipSchema = z.enum(["created", "borrowed"]);

export const worktreeInfoSchema = z.object({
  worktreePath: z.string(),
  worktreeName: z.string(),
  branchName: z.string(),
  baseBranch: z.string(),
  createdAt: z.string(),
  branchOwnership: branchOwnershipSchema.default("created"),
});

export const workspaceTerminalInfoSchema = z.object({
  sessionId: z.string(),
  scriptType: z.enum(["init", "start"]),
  command: z.string(),
  label: z.string(),
  status: z.enum(["running", "completed", "failed"]),
  exitCode: z.number().optional(),
});

export const workspaceInfoSchema = z.object({
  taskId: z.string(),
  mode: workspaceModeSchema,
  worktree: worktreeInfoSchema.nullable(),
  terminalSessionIds: z.array(z.string()),
  hasStartScripts: z.boolean().optional(),
});

export const workspaceSchema = z.object({
  taskId: z.string(),
  folderId: z.string(),
  folderPath: z.string(),
  mode: workspaceModeSchema,
  worktreePath: z.string().nullable(),
  worktreeName: z.string().nullable(),
  branchName: z.string().nullable(),
  baseBranch: z.string().nullable(),
  createdAt: z.string(),
  terminalSessionIds: z.array(z.string()),
  hasStartScripts: z.boolean().optional(),
});

export const scriptExecutionResultSchema = z.object({
  success: z.boolean(),
  terminalSessionIds: z.array(z.string()),
  errors: z.array(z.string()).optional(),
});

// Input schemas
export const createWorkspaceInput = z.object({
  taskId: z.string(),
  mainRepoPath: z
    .string()
    .min(2, "Repository path must be a valid directory path"),
  folderId: z.string(),
  folderPath: z.string().min(2, "Folder path must be a valid directory path"),
  mode: workspaceModeSchema,
  branch: z.string().optional(),
  useExistingBranch: z.boolean().optional(),
});

export const deleteWorkspaceInput = z.object({
  taskId: z.string(),
  mainRepoPath: z.string(),
});

export const verifyWorkspaceInput = z.object({
  taskId: z.string(),
});

export const getWorkspaceInfoInput = z.object({
  taskId: z.string(),
});

export const runStartScriptsInput = z.object({
  taskId: z.string(),
  worktreePath: z.string(),
  worktreeName: z.string(),
});

export const isWorkspaceRunningInput = z.object({
  taskId: z.string(),
});

export const getWorkspaceTerminalsInput = z.object({
  taskId: z.string(),
});

// Output schemas
export const createWorkspaceOutput = workspaceInfoSchema;
export const verifyWorkspaceOutput = z.boolean();
export const getWorkspaceInfoOutput = workspaceInfoSchema.nullable();
export const getAllWorkspacesOutput = z.record(z.string(), workspaceSchema);
export const runStartScriptsOutput = scriptExecutionResultSchema;
export const isWorkspaceRunningOutput = z.boolean();
export const getWorkspaceTerminalsOutput = z.array(workspaceTerminalInfoSchema);

// Event payload schemas (for subscriptions)
export const workspaceTerminalCreatedPayload =
  workspaceTerminalInfoSchema.extend({
    taskId: z.string(),
  });

export const workspaceErrorPayload = z.object({
  taskId: z.string(),
  message: z.string(),
});

export const workspaceWarningPayload = z.object({
  taskId: z.string(),
  title: z.string(),
  message: z.string(),
});

export const workspacePromotedPayload = z.object({
  taskId: z.string(),
  worktree: worktreeInfoSchema,
  fromBranch: z.string(),
});

export const localBackgroundedPayload = z.object({
  mainRepoPath: z.string(),
  localWorktreePath: z.string(),
  branch: z.string(),
});

export const localForegroundedPayload = z.object({
  mainRepoPath: z.string(),
});

// Input/output schemas for local workspace backgrounding
export const isLocalBackgroundedInput = z.object({
  mainRepoPath: z.string(),
});

export const isLocalBackgroundedOutput = z.boolean();

export const getLocalWorktreePathInput = z.object({
  mainRepoPath: z.string(),
});

export const getLocalWorktreePathOutput = z.string();

export const backgroundLocalWorkspaceInput = z.object({
  mainRepoPath: z.string(),
  branch: z.string(),
});

export const backgroundLocalWorkspaceOutput = z.string().nullable();

export const foregroundLocalWorkspaceInput = z.object({
  mainRepoPath: z.string(),
});

export const foregroundLocalWorkspaceOutput = z.boolean();

export const getLocalTasksInput = z.object({
  mainRepoPath: z.string(),
});

export const localTaskSchema = z.object({
  taskId: z.string(),
});

export const getLocalTasksOutput = z.array(localTaskSchema);

// Type exports
export type WorkspaceMode = z.infer<typeof workspaceModeSchema>;
export type BranchOwnership = z.infer<typeof branchOwnershipSchema>;
export type WorktreeInfo = z.infer<typeof worktreeInfoSchema>;
export type WorkspaceTerminalInfo = z.infer<typeof workspaceTerminalInfoSchema>;
export type WorkspaceInfo = z.infer<typeof workspaceInfoSchema>;
export type Workspace = z.infer<typeof workspaceSchema>;
export type ScriptExecutionResult = z.infer<typeof scriptExecutionResultSchema>;

export type CreateWorkspaceInput = z.infer<typeof createWorkspaceInput>;
export type DeleteWorkspaceInput = z.infer<typeof deleteWorkspaceInput>;
export type VerifyWorkspaceInput = z.infer<typeof verifyWorkspaceInput>;
export type GetWorkspaceInfoInput = z.infer<typeof getWorkspaceInfoInput>;
export type RunStartScriptsInput = z.infer<typeof runStartScriptsInput>;
export type IsWorkspaceRunningInput = z.infer<typeof isWorkspaceRunningInput>;
export type GetWorkspaceTerminalsInput = z.infer<
  typeof getWorkspaceTerminalsInput
>;

export type WorkspaceTerminalCreatedPayload = z.infer<
  typeof workspaceTerminalCreatedPayload
>;
export type WorkspaceErrorPayload = z.infer<typeof workspaceErrorPayload>;
export type WorkspaceWarningPayload = z.infer<typeof workspaceWarningPayload>;
export type WorkspacePromotedPayload = z.infer<typeof workspacePromotedPayload>;
export type LocalBackgroundedPayload = z.infer<typeof localBackgroundedPayload>;
export type LocalForegroundedPayload = z.infer<typeof localForegroundedPayload>;
export type IsLocalBackgroundedInput = z.infer<typeof isLocalBackgroundedInput>;
export type GetLocalWorktreePathInput = z.infer<
  typeof getLocalWorktreePathInput
>;
