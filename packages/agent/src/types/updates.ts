import { z } from "zod";
import { MetaSchema, SessionModeIdSchema, sessionUpdate } from "./base";
import { ContentBlockSchema } from "./content";
import { SessionUpdateKind } from "./methods";
import { ToolCallSchema, ToolCallUpdateSchema } from "./tools";

export const StopReasonSchema = z.enum([
  "end_turn",
  "max_tokens",
  "max_turn_requests",
  "cancelled",
  "refusal",
]);

export const PlanEntryStatusSchema = z.enum([
  "pending",
  "in_progress",
  "completed",
]);

export const PlanEntryPrioritySchema = z.enum(["high", "medium", "low"]);

export const PlanEntrySchema = z.object({
  content: z.string(),
  status: PlanEntryStatusSchema,
  priority: PlanEntryPrioritySchema,
  _meta: MetaSchema,
});

export const AvailableCommandSchema = z.object({
  name: z.string(),
  description: z.string(),
  input: z.object({ hint: z.string(), _meta: MetaSchema }).optional(),
  _meta: MetaSchema,
});

export const UserMessageChunkSchema = sessionUpdate(
  SessionUpdateKind.UserMessageChunk,
  {
    content: ContentBlockSchema,
  },
);

export const AgentMessageChunkSchema = sessionUpdate(
  SessionUpdateKind.AgentMessageChunk,
  {
    content: ContentBlockSchema,
  },
);

export const AgentThoughtChunkSchema = sessionUpdate(
  SessionUpdateKind.AgentThoughtChunk,
  {
    content: ContentBlockSchema,
  },
);

export const ToolCallEventSchema = sessionUpdate(
  SessionUpdateKind.ToolCall,
  ToolCallSchema.omit({ _meta: true }).shape,
);

export const ToolCallUpdateEventSchema = sessionUpdate(
  SessionUpdateKind.ToolCallUpdate,
  ToolCallUpdateSchema.omit({ _meta: true }).shape,
);

export const PlanUpdateSchema = sessionUpdate(SessionUpdateKind.Plan, {
  entries: z.array(PlanEntrySchema),
});

export const AvailableCommandsUpdateSchema = sessionUpdate(
  SessionUpdateKind.AvailableCommandsUpdate,
  {
    availableCommands: z.array(AvailableCommandSchema),
  },
);

export const CurrentModeUpdateSchema = sessionUpdate(
  SessionUpdateKind.CurrentModeUpdate,
  {
    currentModeId: SessionModeIdSchema,
  },
);

export const SessionUpdateSchema = z.discriminatedUnion("sessionUpdate", [
  UserMessageChunkSchema,
  AgentMessageChunkSchema,
  AgentThoughtChunkSchema,
  ToolCallEventSchema,
  ToolCallUpdateEventSchema,
  PlanUpdateSchema,
  AvailableCommandsUpdateSchema,
  CurrentModeUpdateSchema,
]);

export function booleanCap() {
  return z.boolean().default(false);
}

export type StopReason = z.infer<typeof StopReasonSchema>;
export type PlanEntryStatus = z.infer<typeof PlanEntryStatusSchema>;
export type PlanEntryPriority = z.infer<typeof PlanEntryPrioritySchema>;
export type PlanEntry = z.infer<typeof PlanEntrySchema>;
export type AvailableCommand = z.infer<typeof AvailableCommandSchema>;
export type UserMessageChunk = z.infer<typeof UserMessageChunkSchema>;
export type AgentMessageChunk = z.infer<typeof AgentMessageChunkSchema>;
export type AgentThoughtChunk = z.infer<typeof AgentThoughtChunkSchema>;
export type ToolCallEvent = z.infer<typeof ToolCallEventSchema>;
export type ToolCallUpdateEvent = z.infer<typeof ToolCallUpdateEventSchema>;
export type PlanUpdate = z.infer<typeof PlanUpdateSchema>;
export type AvailableCommandsUpdate = z.infer<
  typeof AvailableCommandsUpdateSchema
>;
export type CurrentModeUpdate = z.infer<typeof CurrentModeUpdateSchema>;
export type SessionUpdate = z.infer<typeof SessionUpdateSchema>;
