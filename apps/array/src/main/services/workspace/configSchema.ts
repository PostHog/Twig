import { z } from "zod";

const scriptCommand = z.union([
  z.string().min(1, "Script command cannot be empty"),
  z
    .array(z.string().min(1, "Script command cannot be empty"))
    .min(1, "Script array cannot be empty"),
]);

export const arrayConfigSchema = z
  .object({
    scripts: z
      .object({
        init: scriptCommand.optional(),
        start: scriptCommand.optional(),
        destroy: scriptCommand.optional(),
      })
      .strict()
      .optional(),
  })
  .strict();

export type ArrayConfig = z.infer<typeof arrayConfigSchema>;

export type ConfigValidationResult =
  | { success: true; config: ArrayConfig }
  | { success: false; errors: string[] };

export function validateConfig(data: unknown): ConfigValidationResult {
  const result = arrayConfigSchema.safeParse(data);
  if (result.success) {
    return { success: true, config: result.data };
  }
  return {
    success: false,
    errors: result.error.issues.map(
      (issue) => `${issue.path.join(".")}: ${issue.message}`,
    ),
  };
}
