import { z } from "zod";
import type {
  AgentMethodType,
  ClientMethodType,
  SessionUpdateKindType,
} from "@/types/methods";

export const MetaSchema = z.record(z.string(), z.unknown()).optional();

export const SessionIdSchema = z.string().brand<"SessionId">();

export const ToolCallIdSchema = z.string().brand<"ToolCallId">();

export const TerminalIdSchema = z.string().brand<"TerminalId">();

export const PermissionOptionIdSchema = z
  .string()
  .brand<"PermissionOptionId">();

export const SessionModeIdSchema = z.string().brand<"SessionModeId">();

export const ProtocolVersionSchema = z.number().int().min(0).max(65535);

export const RoleSchema = z.enum(["user", "assistant"]);

export const ImplementationSchema = z.object({
  name: z.string(),
  title: z.string().optional(),
  version: z.string(),
  _meta: MetaSchema,
});

export const AnnotationsSchema = z
  .object({
    audience: z.array(RoleSchema).optional(),
    priority: z.number().optional(),
    lastModified: z.iso.datetime().optional(),
    _meta: MetaSchema,
  })
  .optional();

export function contentBlock<T extends string, S extends z.ZodRawShape>(
  type: T,
  shape: S,
) {
  return z.object({
    type: z.literal(type),
    annotations: AnnotationsSchema,
    _meta: MetaSchema,
    ...shape,
  });
}

export function sessionUpdate<
  K extends SessionUpdateKindType,
  S extends z.ZodRawShape,
>(kind: K, shape: S) {
  return z.object({
    sessionUpdate: z.literal(kind),
    _meta: MetaSchema,
    ...shape,
  });
}

export function capabilities<S extends z.ZodRawShape>(shape: S) {
  return z.object({
    _meta: MetaSchema,
    ...shape,
  });
}

export function request<
  M extends AgentMethodType | ClientMethodType,
  S extends z.ZodRawShape,
>(method: M, shape: S) {
  return z.object({
    method: z.literal(method),
    _meta: MetaSchema,
    ...shape,
  });
}

export function response<S extends z.ZodRawShape>(shape: S) {
  return z.object({
    _meta: MetaSchema,
    ...shape,
  });
}

export function notification<
  M extends AgentMethodType | ClientMethodType,
  S extends z.ZodRawShape,
>(method: M, shape: S) {
  return z.object({
    method: z.literal(method),
    _meta: MetaSchema,
    ...shape,
  });
}

export type Meta = z.infer<typeof MetaSchema>;
export type SessionId = z.infer<typeof SessionIdSchema>;
export type ToolCallId = z.infer<typeof ToolCallIdSchema>;
export type TerminalId = z.infer<typeof TerminalIdSchema>;
export type PermissionOptionId = z.infer<typeof PermissionOptionIdSchema>;
export type SessionModeId = z.infer<typeof SessionModeIdSchema>;
export type ProtocolVersion = z.infer<typeof ProtocolVersionSchema>;
export type Role = z.infer<typeof RoleSchema>;
export type Implementation = z.infer<typeof ImplementationSchema>;
export type Annotations = z.infer<typeof AnnotationsSchema>;
