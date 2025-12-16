import { z } from "zod";

export const detectRepoInput = z.object({
  directoryPath: z.string(),
});

export const detectRepoOutput = z
  .object({
    organization: z.string(),
    repository: z.string(),
    remote: z.string().optional(),
    branch: z.string().optional(),
  })
  .nullable();

export type DetectRepoInput = z.infer<typeof detectRepoInput>;
export type DetectRepoResult = z.infer<typeof detectRepoOutput>;

// validateRepo schemas
export const validateRepoInput = z.object({
  directoryPath: z.string(),
});

export const validateRepoOutput = z.boolean();

// cloneRepository schemas
export const cloneRepositoryInput = z.object({
  repoUrl: z.string(),
  targetPath: z.string(),
  cloneId: z.string(),
});

export const cloneRepositoryOutput = z.object({
  cloneId: z.string(),
});

export const cloneProgressStatus = z.enum(["cloning", "complete", "error"]);

export const cloneProgressPayload = z.object({
  cloneId: z.string(),
  status: cloneProgressStatus,
  message: z.string(),
});

export type CloneProgressPayload = z.infer<typeof cloneProgressPayload>;
