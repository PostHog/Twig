import { z } from "zod";

// Session credentials schema
export const credentialsSchema = z.object({
  apiKey: z.string(),
  apiHost: z.string(),
  projectId: z.number(),
});

export type Credentials = z.infer<typeof credentialsSchema>;

// Execution mode schema
export const executionModeSchema = z.enum(["plan", "acceptEdits", "default"]);
export type ExecutionMode = z.infer<typeof executionModeSchema>;

// Session config schema
export const sessionConfigSchema = z.object({
  taskId: z.string(),
  taskRunId: z.string(),
  repoPath: z.string(),
  credentials: credentialsSchema,
  logUrl: z.string().optional(),
  sdkSessionId: z.string().optional(),
  model: z.string().optional(),
  executionMode: executionModeSchema.optional(),
  /** Additional directories Claude can access beyond cwd (for worktree support) */
  additionalDirectories: z.array(z.string()).optional(),
});

export type SessionConfig = z.infer<typeof sessionConfigSchema>;

// Start session input/output

export const startSessionInput = z.object({
  taskId: z.string(),
  taskRunId: z.string(),
  repoPath: z.string(),
  apiKey: z.string(),
  apiHost: z.string(),
  projectId: z.number(),
  permissionMode: z.string().optional(),
  autoProgress: z.boolean().optional(),
  model: z.string().optional(),
  executionMode: z.enum(["plan", "acceptEdits", "default"]).optional(),
  runMode: z.enum(["local", "cloud"]).optional(),
  /** Additional directories Claude can access beyond cwd (for worktree support) */
  additionalDirectories: z.array(z.string()).optional(),
});

export type StartSessionInput = z.infer<typeof startSessionInput>;

export const sessionResponseSchema = z.object({
  sessionId: z.string(),
  channel: z.string(),
});

export type SessionResponse = z.infer<typeof sessionResponseSchema>;

// Prompt input/output
export const contentBlockSchema = z
  .object({
    type: z.string(),
    text: z.string().optional(),
    _meta: z.record(z.string(), z.unknown()).nullish(),
  })
  .passthrough();

export const promptInput = z.object({
  sessionId: z.string(),
  prompt: z.array(contentBlockSchema),
});

export type PromptInput = z.infer<typeof promptInput>;

export const promptOutput = z.object({
  stopReason: z.string(),
  _meta: z
    .object({
      interruptReason: z.string().optional(),
    })
    .optional(),
});

export type PromptOutput = z.infer<typeof promptOutput>;

// Cancel session input
export const cancelSessionInput = z.object({
  sessionId: z.string(),
});

// Interrupt reason schema
export const interruptReasonSchema = z.enum([
  "user_request",
  "moving_to_worktree",
]);
export type InterruptReason = z.infer<typeof interruptReasonSchema>;

// Cancel prompt input
export const cancelPromptInput = z.object({
  sessionId: z.string(),
  reason: interruptReasonSchema.optional(),
});

// Reconnect session input
export const reconnectSessionInput = z.object({
  taskId: z.string(),
  taskRunId: z.string(),
  repoPath: z.string(),
  apiKey: z.string(),
  apiHost: z.string(),
  projectId: z.number(),
  logUrl: z.string().optional(),
  sdkSessionId: z.string().optional(),
  /** Additional directories Claude can access beyond cwd (for worktree support) */
  additionalDirectories: z.array(z.string()).optional(),
});

export type ReconnectSessionInput = z.infer<typeof reconnectSessionInput>;

// Token update input - updates the global token for all agent operations
export const tokenUpdateInput = z.object({
  token: z.string(),
});

// Set model input
export const setModelInput = z.object({
  sessionId: z.string(),
  modelId: z.string(),
});

// Set mode input
export const setModeInput = z.object({
  sessionId: z.string(),
  modeId: z.enum(["plan", "default", "acceptEdits"]),
});

// Subscribe to session events input
export const subscribeSessionInput = z.object({
  sessionId: z.string(),
});

// Agent events
export const AgentServiceEvent = {
  SessionEvent: "session-event",
  PermissionRequest: "permission-request",
} as const;

export interface AgentSessionEventPayload {
  sessionId: string;
  payload: unknown;
}

export interface PermissionOption {
  kind: "allow_once" | "allow_always" | "reject_once" | "reject_always";
  name: string;
  optionId: string;
  description?: string;
}

export interface PermissionRequestPayload {
  sessionId: string;
  toolCallId: string;
  title: string;
  options: PermissionOption[];
  rawInput: unknown;
}

export interface AgentServiceEvents {
  [AgentServiceEvent.SessionEvent]: AgentSessionEventPayload;
  [AgentServiceEvent.PermissionRequest]: PermissionRequestPayload;
}

// Permission response input for tRPC
export const respondToPermissionInput = z.object({
  sessionId: z.string(),
  toolCallId: z.string(),
  optionId: z.string(),
  // For multi-select mode: array of selected option IDs
  selectedOptionIds: z.array(z.string()).optional(),
  // For "Other" option: custom text input from user
  customInput: z.string().optional(),
});

export type RespondToPermissionInput = z.infer<typeof respondToPermissionInput>;

// Permission cancellation input for tRPC
export const cancelPermissionInput = z.object({
  sessionId: z.string(),
  toolCallId: z.string(),
});

export type CancelPermissionInput = z.infer<typeof cancelPermissionInput>;

export const listSessionsInput = z.object({
  taskId: z.string(),
});

export const detachedHeadContext = z.object({
  type: z.literal("detached_head"),
  branchName: z.string(),
  isDetached: z.boolean(),
});

export const sessionContextChangeSchema = detachedHeadContext;

export type SessionContextChange = z.infer<typeof sessionContextChangeSchema>;

export const notifySessionContextInput = z.object({
  sessionId: z.string(),
  context: sessionContextChangeSchema,
});

export type NotifySessionContextInput = z.infer<
  typeof notifySessionContextInput
>;

export const sessionInfoSchema = z.object({
  taskRunId: z.string(),
  repoPath: z.string(),
});

export const listSessionsOutput = z.array(sessionInfoSchema);
