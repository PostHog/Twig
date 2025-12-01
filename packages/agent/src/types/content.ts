import { z } from "zod";
import { contentBlock, MetaSchema } from "./base";

export const TextContentSchema = contentBlock("text", {
  text: z.string(),
});

export const ImageContentSchema = contentBlock("image", {
  data: z.string(),
  mimeType: z.string(),
  uri: z.string().optional(),
});

export const AudioContentSchema = contentBlock("audio", {
  data: z.string(),
  mimeType: z.string(),
});

export const ResourceLinkSchema = contentBlock("resource_link", {
  uri: z.string(),
  name: z.string(),
  title: z.string().optional(),
  description: z.string().optional(),
  mimeType: z.string().optional(),
  size: z.number().int().nonnegative().optional(),
});

export const TextResourceContentsSchema = z.object({
  uri: z.string(),
  text: z.string(),
  mimeType: z.string().optional(),
  _meta: MetaSchema,
});

export const BlobResourceContentsSchema = z.object({
  uri: z.string(),
  blob: z.string(),
  mimeType: z.string().optional(),
  _meta: MetaSchema,
});

export const ResourceSchema = contentBlock("resource", {
  resource: z.union([TextResourceContentsSchema, BlobResourceContentsSchema]),
});

export const ContentBlockSchema = z.discriminatedUnion("type", [
  TextContentSchema,
  ImageContentSchema,
  AudioContentSchema,
  ResourceLinkSchema,
  ResourceSchema,
]);

export type TextContent = z.infer<typeof TextContentSchema>;
export type ImageContent = z.infer<typeof ImageContentSchema>;
export type AudioContent = z.infer<typeof AudioContentSchema>;
export type ResourceLink = z.infer<typeof ResourceLinkSchema>;
export type TextResourceContents = z.infer<typeof TextResourceContentsSchema>;
export type BlobResourceContents = z.infer<typeof BlobResourceContentsSchema>;
export type Resource = z.infer<typeof ResourceSchema>;
export type ContentBlock = z.infer<typeof ContentBlockSchema>;
