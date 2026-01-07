import { z } from "zod";

// Session credentials schema
export const credentialsSchema = z.object({
  apiKey: z.string(),
  apiHost: z.string(),
  projectId: z.number(),
});

export type Credentials = z.infer<typeof credentialsSchema>;

// Agent framework schema
export const agentFrameworkSchema = z.enum(["claude", "codex"]);
export type AgentFramework = z.infer<typeof agentFrameworkSchema>;

// Execution mode schema
export const executionModeSchema = z.enum(["plan"]);
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
  framework: agentFrameworkSchema.optional(),
  executionMode: executionModeSchema.optional(),
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
  framework: agentFrameworkSchema.optional().default("claude"),
  executionMode: z.enum(["plan"]).optional(),
  runMode: z.enum(["local", "cloud"]).optional(),
  createPR: z.boolean().optional(),
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
    _meta: z.record(z.string(), z.unknown()).optional(),
  })
  .passthrough();

export const promptInput = z.object({
  sessionId: z.string(),
  prompt: z.array(contentBlockSchema),
});

export type PromptInput = z.infer<typeof promptInput>;

export const promptOutput = z.object({
  stopReason: z.string(),
});

export type PromptOutput = z.infer<typeof promptOutput>;

// Cancel session input
export const cancelSessionInput = z.object({
  sessionId: z.string(),
});

// Cancel prompt input
export const cancelPromptInput = z.object({
  sessionId: z.string(),
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
});

export type ReconnectSessionInput = z.infer<typeof reconnectSessionInput>;

// Token refresh input
export const tokenRefreshInput = z.object({
  taskRunId: z.string(),
  newToken: z.string(),
});

// Set model input
export const setModelInput = z.object({
  sessionId: z.string(),
  modelId: z.string(),
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
});

export type RespondToPermissionInput = z.infer<typeof respondToPermissionInput>;
