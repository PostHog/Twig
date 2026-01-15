import { z } from "zod";

// Simplified workspace schemas for jj workspaces

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
  workspaceName: z.string(),
  workspacePath: z.string(),
  repoPath: z.string(),
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
  taskTitle: z.string(),
  repoPath: z.string().min(2, "Repository path must be a valid directory path"),
  folderId: z.string(),
});

export const deleteWorkspaceInput = z.object({
  taskId: z.string(),
});

export const verifyWorkspaceInput = z.object({
  taskId: z.string(),
});

export const getWorkspaceInfoInput = z.object({
  taskId: z.string(),
});

export const runStartScriptsInput = z.object({
  taskId: z.string(),
  workspacePath: z.string(),
  workspaceName: z.string(),
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
export const getAllWorkspacesOutput = z.record(z.string(), workspaceInfoSchema);
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

// Type exports
export type WorkspaceTerminalInfo = z.infer<typeof workspaceTerminalInfoSchema>;
export type WorkspaceInfo = z.infer<typeof workspaceInfoSchema>;
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
