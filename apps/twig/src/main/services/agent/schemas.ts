import type {
  RequestPermissionRequest,
  PermissionOption as SdkPermissionOption,
} from "@agentclientprotocol/sdk";
import { executionModeSchema } from "@shared/types";
import { z } from "zod";

// Session credentials schema
export const credentialsSchema = z.object({
  apiKey: z.string(),
  apiHost: z.string(),
  projectId: z.number(),
});

export type Credentials = z.infer<typeof credentialsSchema>;

// Session config schema
export const sessionConfigSchema = z.object({
  taskId: z.string(),
  taskRunId: z.string(),
  repoPath: z.string(),
  credentials: credentialsSchema,
  logUrl: z.string().optional(),
  /** The agent's session ID (for resume - SDK session ID for Claude, Codex's session ID for Codex) */
  sessionId: z.string().optional(),
  model: z.string().optional(),
  executionMode: executionModeSchema.optional(),
  adapter: z.enum(["claude", "codex"]).optional(),
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
  executionMode: z
    .enum(["default", "acceptEdits", "plan", "bypassPermissions"])
    .optional(),
  runMode: z.enum(["local", "cloud"]).optional(),
  adapter: z.enum(["claude", "codex"]).optional(),
  /** Additional directories Claude can access beyond cwd (for worktree support) */
  additionalDirectories: z.array(z.string()).optional(),
});

export type StartSessionInput = z.infer<typeof startSessionInput>;

export const modelOptionSchema = z.object({
  modelId: z.string(),
  name: z.string(),
  description: z.string().nullish(),
  provider: z.string().optional(),
});

export type ModelOption = z.infer<typeof modelOptionSchema>;

export const sessionResponseSchema = z.object({
  sessionId: z.string(),
  channel: z.string(),
  availableModels: z.array(modelOptionSchema).optional(),
  currentModelId: z.string().optional(),
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
  sessionId: z.string().optional(),
  adapter: z.enum(["claude", "codex"]).optional(),
  model: z.string().optional(),
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
  modeId: executionModeSchema,
});

// Set config option input (for Codex reasoning level, etc.)
export const setConfigOptionInput = z.object({
  sessionId: z.string(),
  configId: z.string(),
  value: z.string(),
});

// Subscribe to session events input
export const subscribeSessionInput = z.object({
  taskRunId: z.string(),
});

// Agent events
export const AgentServiceEvent = {
  SessionEvent: "session-event",
  PermissionRequest: "permission-request",
} as const;

export interface AgentSessionEventPayload {
  taskRunId: string;
  payload: unknown;
}

export type PermissionOption = SdkPermissionOption;
export type PermissionRequestPayload = Omit<
  RequestPermissionRequest,
  "sessionId"
> & {
  taskRunId: string;
};

export interface AgentServiceEvents {
  [AgentServiceEvent.SessionEvent]: AgentSessionEventPayload;
  [AgentServiceEvent.PermissionRequest]: PermissionRequestPayload;
}

// Permission response input for tRPC
export const respondToPermissionInput = z.object({
  taskRunId: z.string(),
  toolCallId: z.string(),
  optionId: z.string(),
  // For "Other" option: custom text input from user (ACP extension via _meta)
  customInput: z.string().optional(),
  // For multi-question flows: all answers keyed by question text
  answers: z.record(z.string(), z.string()).optional(),
});

export type RespondToPermissionInput = z.infer<typeof respondToPermissionInput>;

// Permission cancellation input for tRPC
export const cancelPermissionInput = z.object({
  taskRunId: z.string(),
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

export const getGatewayModelsInput = z.object({
  apiHost: z.string(),
  apiKey: z.string(),
});

export const getGatewayModelsOutput = z.array(modelOptionSchema);
