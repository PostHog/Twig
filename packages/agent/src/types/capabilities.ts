import type { z } from "zod";
import { capabilities } from "./base";
import { booleanCap } from "./updates";

export const PromptCapabilitiesSchema = capabilities({
  audio: booleanCap(),
  image: booleanCap(),
  embeddedContext: booleanCap(),
});

export const McpCapabilitiesSchema = capabilities({
  http: booleanCap(),
  sse: booleanCap(),
});

export const SessionCapabilitiesSchema = capabilities({});

export const AgentCapabilitiesSchema = capabilities({
  loadSession: booleanCap(),
  promptCapabilities: PromptCapabilitiesSchema,
  mcpCapabilities: McpCapabilitiesSchema,
  sessionCapabilities: SessionCapabilitiesSchema,
});

export const FileSystemCapabilitySchema = capabilities({
  readTextFile: booleanCap(),
  writeTextFile: booleanCap(),
});

export const ClientCapabilitiesSchema = capabilities({
  fs: FileSystemCapabilitySchema,
  terminal: booleanCap(),
});

export type PromptCapabilities = z.infer<typeof PromptCapabilitiesSchema>;
export type McpCapabilities = z.infer<typeof McpCapabilitiesSchema>;
export type SessionCapabilities = z.infer<typeof SessionCapabilitiesSchema>;
export type AgentCapabilities = z.infer<typeof AgentCapabilitiesSchema>;
export type FileSystemCapability = z.infer<typeof FileSystemCapabilitySchema>;
export type ClientCapabilities = z.infer<typeof ClientCapabilitiesSchema>;
