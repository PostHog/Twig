import { z } from "zod";

export const environmentTypeSchema = z.enum(["local", "cloud"]);

export const environmentCapabilitiesSchema = z.object({
  shell: z.boolean(),
  files: z.boolean(),
  git: z.boolean(),
  workspace: z.boolean(),
  scripts: z.boolean(),
});

export const createEnvironmentInput = z.object({
  taskId: z.string(),
  type: environmentTypeSchema,
});

export const taskIdInput = z.object({
  taskId: z.string(),
});

export const getCapabilitiesOutput = environmentCapabilitiesSchema.nullable();

export const getTypeOutput = environmentTypeSchema.nullable();

export type EnvironmentTypeInput = z.infer<typeof environmentTypeSchema>;
export type CreateEnvironmentInput = z.infer<typeof createEnvironmentInput>;
export type TaskIdInput = z.infer<typeof taskIdInput>;
