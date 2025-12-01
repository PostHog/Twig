import { z } from "zod";
import {
  ImplementationSchema,
  notification,
  PermissionOptionIdSchema,
  ProtocolVersionSchema,
  request,
  response,
  SessionIdSchema,
  SessionModeIdSchema,
  TerminalIdSchema,
} from "./base";
import {
  AgentCapabilitiesSchema,
  ClientCapabilitiesSchema,
} from "./capabilities";
import { ContentBlockSchema } from "./content";
import { AgentMethod, ClientMethod } from "./methods";
import { ToolCallUpdateSchema } from "./tools";
import { SessionUpdateSchema, StopReasonSchema } from "./updates";

// ─────────────────────────────────────────────────────────────
// Agent Methods (client → agent)
// ─────────────────────────────────────────────────────────────

export const InitializeRequestSchema = request(AgentMethod.Initialize, {
  protocolVersion: ProtocolVersionSchema,
  clientInfo: ImplementationSchema.optional(),
  clientCapabilities: ClientCapabilitiesSchema.optional(),
});

export const InitializeResponseSchema = response({
  protocolVersion: ProtocolVersionSchema,
  agentInfo: ImplementationSchema.optional(),
  agentCapabilities: AgentCapabilitiesSchema.optional(),
  authMethods: z
    .array(
      z.object({
        id: z.string(),
        name: z.string(),
        description: z.string().optional(),
      }),
    )
    .default([]),
});

export const AuthenticateRequestSchema = request(AgentMethod.Authenticate, {
  methodId: z.string(),
});

export const AuthenticateResponseSchema = response({});

export const NewSessionRequestSchema = request(AgentMethod.Session.New, {
  cwd: z.string(),
  mcpServers: z.array(z.unknown()).default([]),
});

export const NewSessionResponseSchema = response({
  sessionId: SessionIdSchema,
  modes: z
    .object({
      availableModes: z.array(
        z.object({
          id: SessionModeIdSchema,
          name: z.string(),
          description: z.string().optional(),
        }),
      ),
      currentModeId: SessionModeIdSchema,
    })
    .optional(),
});

export const LoadSessionRequestSchema = request(AgentMethod.Session.Load, {
  sessionId: SessionIdSchema,
  cwd: z.string(),
  mcpServers: z.array(z.unknown()).default([]),
});

export const LoadSessionResponseSchema = response({
  modes: z
    .object({
      availableModes: z.array(
        z.object({
          id: SessionModeIdSchema,
          name: z.string(),
          description: z.string().optional(),
        }),
      ),
      currentModeId: SessionModeIdSchema,
    })
    .optional(),
});

export const PromptRequestSchema = request(AgentMethod.Session.Prompt, {
  sessionId: SessionIdSchema,
  prompt: z.array(ContentBlockSchema),
});

export const PromptResponseSchema = response({
  stopReason: StopReasonSchema,
});

export const CancelNotificationSchema = notification(
  AgentMethod.Session.Cancel,
  {
    sessionId: SessionIdSchema,
  },
);

export const SetModeRequestSchema = request(AgentMethod.Session.SetMode, {
  sessionId: SessionIdSchema,
  modeId: SessionModeIdSchema,
});

export const SetModeResponseSchema = response({});

export const SessionUpdateNotificationSchema = notification(
  ClientMethod.Session.Update,
  {
    sessionId: SessionIdSchema,
    update: SessionUpdateSchema,
  },
);

export const PermissionOptionKindSchema = z.enum([
  "allow_once",
  "allow_always",
  "reject_once",
  "reject_always",
]);

export const PermissionOptionSchema = z.object({
  optionId: PermissionOptionIdSchema,
  name: z.string(),
  kind: PermissionOptionKindSchema,
});

export const RequestPermissionRequestSchema = request(
  ClientMethod.Session.RequestPermission,
  {
    sessionId: SessionIdSchema,
    toolCall: ToolCallUpdateSchema,
    options: z.array(PermissionOptionSchema),
  },
);

export const RequestPermissionOutcomeSchema = z.discriminatedUnion("outcome", [
  z.object({ outcome: z.literal("cancelled") }),
  z.object({
    outcome: z.literal("selected"),
    optionId: PermissionOptionIdSchema,
  }),
]);

export const RequestPermissionResponseSchema = response({
  outcome: RequestPermissionOutcomeSchema,
});

export const ReadTextFileRequestSchema = request(ClientMethod.Fs.ReadTextFile, {
  sessionId: SessionIdSchema,
  path: z.string(),
  line: z.number().int().nonnegative().optional(),
  limit: z.number().int().nonnegative().optional(),
});

export const ReadTextFileResponseSchema = response({
  content: z.string(),
});

export const WriteTextFileRequestSchema = request(
  ClientMethod.Fs.WriteTextFile,
  {
    sessionId: SessionIdSchema,
    path: z.string(),
    content: z.string(),
  },
);

export const WriteTextFileResponseSchema = response({});

export const CreateTerminalRequestSchema = request(
  ClientMethod.Terminal.Create,
  {
    sessionId: SessionIdSchema,
    command: z.string(),
    args: z.array(z.string()).optional(),
    cwd: z.string().optional(),
    env: z.array(z.object({ name: z.string(), value: z.string() })).optional(),
    outputByteLimit: z.number().int().nonnegative().optional(),
  },
);

export const CreateTerminalResponseSchema = response({
  terminalId: TerminalIdSchema,
});

export const TerminalOutputRequestSchema = request(
  ClientMethod.Terminal.Output,
  {
    sessionId: SessionIdSchema,
    terminalId: TerminalIdSchema,
  },
);

export const TerminalOutputResponseSchema = response({
  output: z.string(),
  truncated: z.boolean(),
  exitStatus: z
    .object({
      exitCode: z.number().int().nonnegative().optional(),
      signal: z.string().optional(),
    })
    .optional(),
});

export const KillTerminalRequestSchema = request(ClientMethod.Terminal.Kill, {
  sessionId: SessionIdSchema,
  terminalId: TerminalIdSchema,
});

export const KillTerminalResponseSchema = response({});

export const ReleaseTerminalRequestSchema = request(
  ClientMethod.Terminal.Release,
  {
    sessionId: SessionIdSchema,
    terminalId: TerminalIdSchema,
  },
);

export const ReleaseTerminalResponseSchema = response({});

export const WaitForExitRequestSchema = request(
  ClientMethod.Terminal.WaitForExit,
  {
    sessionId: SessionIdSchema,
    terminalId: TerminalIdSchema,
  },
);

export const WaitForExitResponseSchema = response({
  exitCode: z.number().int().nonnegative().optional(),
  signal: z.string().optional(),
});

export type InitializeRequest = z.infer<typeof InitializeRequestSchema>;
export type InitializeResponse = z.infer<typeof InitializeResponseSchema>;
export type AuthenticateRequest = z.infer<typeof AuthenticateRequestSchema>;
export type AuthenticateResponse = z.infer<typeof AuthenticateResponseSchema>;
export type NewSessionRequest = z.infer<typeof NewSessionRequestSchema>;
export type NewSessionResponse = z.infer<typeof NewSessionResponseSchema>;
export type LoadSessionRequest = z.infer<typeof LoadSessionRequestSchema>;
export type LoadSessionResponse = z.infer<typeof LoadSessionResponseSchema>;
export type PromptRequest = z.infer<typeof PromptRequestSchema>;
export type PromptResponse = z.infer<typeof PromptResponseSchema>;
export type CancelNotification = z.infer<typeof CancelNotificationSchema>;
export type SetModeRequest = z.infer<typeof SetModeRequestSchema>;
export type SetModeResponse = z.infer<typeof SetModeResponseSchema>;
export type SessionUpdateNotification = z.infer<
  typeof SessionUpdateNotificationSchema
>;
export type PermissionOptionKind = z.infer<typeof PermissionOptionKindSchema>;
export type PermissionOption = z.infer<typeof PermissionOptionSchema>;
export type RequestPermissionRequest = z.infer<
  typeof RequestPermissionRequestSchema
>;
export type RequestPermissionOutcome = z.infer<
  typeof RequestPermissionOutcomeSchema
>;
export type RequestPermissionResponse = z.infer<
  typeof RequestPermissionResponseSchema
>;
export type ReadTextFileRequest = z.infer<typeof ReadTextFileRequestSchema>;
export type ReadTextFileResponse = z.infer<typeof ReadTextFileResponseSchema>;
export type WriteTextFileRequest = z.infer<typeof WriteTextFileRequestSchema>;
export type WriteTextFileResponse = z.infer<typeof WriteTextFileResponseSchema>;
export type CreateTerminalRequest = z.infer<typeof CreateTerminalRequestSchema>;
export type CreateTerminalResponse = z.infer<
  typeof CreateTerminalResponseSchema
>;
export type TerminalOutputRequest = z.infer<typeof TerminalOutputRequestSchema>;
export type TerminalOutputResponse = z.infer<
  typeof TerminalOutputResponseSchema
>;
export type KillTerminalRequest = z.infer<typeof KillTerminalRequestSchema>;
export type KillTerminalResponse = z.infer<typeof KillTerminalResponseSchema>;
export type ReleaseTerminalRequest = z.infer<
  typeof ReleaseTerminalRequestSchema
>;
export type ReleaseTerminalResponse = z.infer<
  typeof ReleaseTerminalResponseSchema
>;
export type WaitForExitRequest = z.infer<typeof WaitForExitRequestSchema>;
export type WaitForExitResponse = z.infer<typeof WaitForExitResponseSchema>;
