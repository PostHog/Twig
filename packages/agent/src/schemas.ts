import { z } from "zod";

// Base event schema with timestamp
const BaseEventSchema = z.object({
  ts: z.number(),
});

// Streaming content events
export const TokenEventSchema = BaseEventSchema.extend({
  type: z.literal("token"),
  content: z.string(),
  contentType: z.enum(["text", "thinking", "tool_input"]).optional(),
});

export const ContentBlockStartEventSchema = BaseEventSchema.extend({
  type: z.literal("content_block_start"),
  index: z.number(),
  contentType: z.enum(["text", "tool_use", "thinking"]),
  toolName: z.string().optional(),
  toolId: z.string().optional(),
});

export const ContentBlockStopEventSchema = BaseEventSchema.extend({
  type: z.literal("content_block_stop"),
  index: z.number(),
});

// Tool events
export const ToolCallEventSchema = BaseEventSchema.extend({
  type: z.literal("tool_call"),
  toolName: z.string(),
  callId: z.string(),
  args: z.record(z.string(), z.unknown()),
  parentToolUseId: z.string().nullable().optional(),
  tool: z.unknown().optional(),
  category: z.unknown().optional(),
});

export const ToolResultEventSchema = BaseEventSchema.extend({
  type: z.literal("tool_result"),
  toolName: z.string(),
  callId: z.string(),
  result: z.unknown(),
  isError: z.boolean().optional(),
  parentToolUseId: z.string().nullable().optional(),
  tool: z.unknown().optional(),
  category: z.unknown().optional(),
});

// Message lifecycle events
export const MessageStartEventSchema = BaseEventSchema.extend({
  type: z.literal("message_start"),
  messageId: z.string().optional(),
  model: z.string().optional(),
});

export const MessageDeltaEventSchema = BaseEventSchema.extend({
  type: z.literal("message_delta"),
  stopReason: z.string().optional(),
  stopSequence: z.string().optional(),
  usage: z
    .object({
      outputTokens: z.number(),
    })
    .optional(),
});

export const MessageStopEventSchema = BaseEventSchema.extend({
  type: z.literal("message_stop"),
});

// User message events
export const UserMessageEventSchema = BaseEventSchema.extend({
  type: z.literal("user_message"),
  content: z.string(),
  isSynthetic: z.boolean().optional(),
});

// System events
export const StatusEventSchema = BaseEventSchema.extend({
  type: z.literal("status"),
  phase: z.string(),
  kind: z.string().optional(),
  branch: z.string().optional(),
  prUrl: z.string().optional(),
  taskId: z.string().optional(),
  messageId: z.string().optional(),
  model: z.string().optional(),
}).passthrough(); // Allow additional fields

export const InitEventSchema = BaseEventSchema.extend({
  type: z.literal("init"),
  model: z.string(),
  tools: z.array(z.string()),
  permissionMode: z.string(),
  cwd: z.string(),
  apiKeySource: z.string(),
  agents: z.array(z.string()).optional(),
  slashCommands: z.array(z.string()).optional(),
  outputStyle: z.string().optional(),
  mcpServers: z
    .array(z.object({ name: z.string(), status: z.string() }))
    .optional(),
});

// Console event for log-style output
export const ConsoleEventSchema = BaseEventSchema.extend({
  type: z.literal("console"),
  level: z.enum(["debug", "info", "warn", "error"]),
  message: z.string(),
});

export const CompactBoundaryEventSchema = BaseEventSchema.extend({
  type: z.literal("compact_boundary"),
  trigger: z.enum(["manual", "auto"]),
  preTokens: z.number(),
});

// Result events
export const DoneEventSchema = BaseEventSchema.extend({
  type: z.literal("done"),
  result: z.string().optional(),
  durationMs: z.number().optional(),
  durationApiMs: z.number().optional(),
  numTurns: z.number().optional(),
  totalCostUsd: z.number().optional(),
  usage: z.unknown().optional(),
  modelUsage: z
    .record(
      z.string(),
      z.object({
        inputTokens: z.number(),
        outputTokens: z.number(),
        cacheReadInputTokens: z.number(),
        cacheCreationInputTokens: z.number(),
        webSearchRequests: z.number(),
        costUSD: z.number(),
        contextWindow: z.number(),
      }),
    )
    .optional(),
  permissionDenials: z
    .array(
      z.object({
        tool_name: z.string(),
        tool_use_id: z.string(),
        tool_input: z.record(z.string(), z.unknown()),
      }),
    )
    .optional(),
});

export const ErrorEventSchema = BaseEventSchema.extend({
  type: z.literal("error"),
  message: z.string(),
  error: z.unknown().optional(),
  errorType: z.string().optional(),
  context: z.record(z.string(), z.unknown()).optional(),
  sdkError: z.unknown().optional(),
});

// Metric and artifact events
export const MetricEventSchema = BaseEventSchema.extend({
  type: z.literal("metric"),
  key: z.string(),
  value: z.number(),
  unit: z.string().optional(),
});

export const ArtifactEventSchema = BaseEventSchema.extend({
  type: z.literal("artifact"),
  kind: z.string(),
  content: z.unknown(),
});

export const RawSDKEventSchema = BaseEventSchema.extend({
  type: z.literal("raw_sdk_event"),
  sdkMessage: z.unknown(),
});

export const AgentEventSchema = z.discriminatedUnion("type", [
  TokenEventSchema,
  ContentBlockStartEventSchema,
  ContentBlockStopEventSchema,
  ToolCallEventSchema,
  ToolResultEventSchema,
  MessageStartEventSchema,
  MessageDeltaEventSchema,
  MessageStopEventSchema,
  UserMessageEventSchema,
  StatusEventSchema,
  InitEventSchema,
  ConsoleEventSchema,
  CompactBoundaryEventSchema,
  DoneEventSchema,
  ErrorEventSchema,
  MetricEventSchema,
  ArtifactEventSchema,
  RawSDKEventSchema,
]);

export type TokenEvent = z.infer<typeof TokenEventSchema>;
export type ContentBlockStartEvent = z.infer<
  typeof ContentBlockStartEventSchema
>;
export type ContentBlockStopEvent = z.infer<typeof ContentBlockStopEventSchema>;
export type ToolCallEvent = z.infer<typeof ToolCallEventSchema>;
export type ToolResultEvent = z.infer<typeof ToolResultEventSchema>;
export type MessageStartEvent = z.infer<typeof MessageStartEventSchema>;
export type MessageDeltaEvent = z.infer<typeof MessageDeltaEventSchema>;
export type MessageStopEvent = z.infer<typeof MessageStopEventSchema>;
export type UserMessageEvent = z.infer<typeof UserMessageEventSchema>;
export type StatusEvent = z.infer<typeof StatusEventSchema>;
export type InitEvent = z.infer<typeof InitEventSchema>;
export type ConsoleEvent = z.infer<typeof ConsoleEventSchema>;
export type CompactBoundaryEvent = z.infer<typeof CompactBoundaryEventSchema>;
export type DoneEvent = z.infer<typeof DoneEventSchema>;
export type ErrorEvent = z.infer<typeof ErrorEventSchema>;
export type MetricEvent = z.infer<typeof MetricEventSchema>;
export type ArtifactEvent = z.infer<typeof ArtifactEventSchema>;
export type RawSDKEvent = z.infer<typeof RawSDKEventSchema>;
export type AgentEvent = z.infer<typeof AgentEventSchema>;

/**
 * Parse and validate an AgentEvent from unknown input.
 * Returns the parsed event if valid, or null if invalid.
 */
export function parseAgentEvent(input: unknown): AgentEvent | null {
  const result = AgentEventSchema.safeParse(input);
  return result.success ? result.data : null;
}

/**
 * Parse and validate multiple AgentEvents from an array of unknown inputs.
 * Invalid entries are discarded.
 */
export function parseAgentEvents(inputs: unknown[]): AgentEvent[] {
  return inputs
    .map((input) => parseAgentEvent(input))
    .filter((event): event is AgentEvent => event !== null);
}
