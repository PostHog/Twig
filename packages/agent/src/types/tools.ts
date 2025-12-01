import { z } from "zod";
import { contentBlock, MetaSchema, ToolCallIdSchema } from "./base";
import { ContentBlockSchema } from "./content";

export const ToolKindSchema = z.enum([
  "read",
  "edit",
  "delete",
  "move",
  "search",
  "execute",
  "think",
  "fetch",
  "switch_mode",
  "other",
]);

export const ToolCallStatusSchema = z.enum([
  "pending",
  "in_progress",
  "completed",
  "failed",
]);

export const ToolCallLocationSchema = z.object({
  path: z.string(),
  line: z.number().int().nonnegative().optional(),
  _meta: MetaSchema,
});

export const ToolContentSchema = contentBlock("content", {
  content: ContentBlockSchema,
});

export const ToolDiffSchema = contentBlock("diff", {
  path: z.string(),
  oldText: z.string().optional(),
  newText: z.string(),
});

export const ToolTerminalSchema = contentBlock("terminal", {
  terminalId: z.string(),
});

export const ToolCallContentSchema = z.discriminatedUnion("type", [
  ToolContentSchema,
  ToolDiffSchema,
  ToolTerminalSchema,
]);

export const ToolCallSchema = z.object({
  toolCallId: ToolCallIdSchema,
  title: z.string(),
  kind: ToolKindSchema.optional(),
  status: ToolCallStatusSchema.optional(),
  rawInput: z.record(z.string(), z.unknown()).optional(),
  rawOutput: z.record(z.string(), z.unknown()).optional(),
  content: z.array(ToolCallContentSchema).optional(),
  locations: z.array(ToolCallLocationSchema).optional(),
  _meta: MetaSchema,
});

export const ToolCallUpdateSchema = ToolCallSchema.partial().required({
  toolCallId: true,
});

export type ToolKind = z.infer<typeof ToolKindSchema>;
export type ToolCallStatus = z.infer<typeof ToolCallStatusSchema>;
export type ToolCallLocation = z.infer<typeof ToolCallLocationSchema>;
export type ToolContent = z.infer<typeof ToolContentSchema>;
export type ToolDiff = z.infer<typeof ToolDiffSchema>;
export type ToolTerminal = z.infer<typeof ToolTerminalSchema>;
export type ToolCallContent = z.infer<typeof ToolCallContentSchema>;
export type ToolCall = z.infer<typeof ToolCallSchema>;
export type ToolCallUpdate = z.infer<typeof ToolCallUpdateSchema>;
