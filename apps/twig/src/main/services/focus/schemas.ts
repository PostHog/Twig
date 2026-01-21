import { z } from "zod";

export const focusResultSchema = z.object({
  success: z.boolean(),
  error: z.string().optional(),
  stashPopWarning: z.string().optional(),
});

export type FocusResult = z.infer<typeof focusResultSchema>;

export const stashResultSchema = focusResultSchema.extend({
  stashRef: z.string().optional(),
});

export type StashResult = z.infer<typeof stashResultSchema>;

export const focusRefDataSchema = z.object({
  status: z.enum(["focusing", "focused", "unfocusing"]),
  originalBranch: z.string(),
  targetBranch: z.string(),
  mainStashRef: z.string().nullable(),
  localWorktreePath: z.string().nullable(),
});

export type FocusRefData = z.infer<typeof focusRefDataSchema>;

export interface FocusSession {
  mainRepoPath: string;
  worktreePath: string;
  branch: string;
  originalBranch: string;
  mainStashRef: string | null;
  localWorktreePath: string | null;
}

export const repoPathInput = z.object({ repoPath: z.string() });
export const mainRepoPathInput = z.object({ mainRepoPath: z.string() });
export const stashInput = z.object({
  repoPath: z.string(),
  message: z.string(),
});
export const checkoutInput = z.object({
  repoPath: z.string(),
  branch: z.string(),
});
export const worktreeInput = z.object({ worktreePath: z.string() });
export const reattachInput = z.object({
  worktreePath: z.string(),
  branch: z.string(),
});
export const writeRefInput = z.object({
  mainRepoPath: z.string(),
  data: focusRefDataSchema,
});
export const syncInput = z.object({
  mainRepoPath: z.string(),
  worktreePath: z.string(),
});
export const findWorktreeInput = z.object({
  mainRepoPath: z.string(),
  branch: z.string(),
});

export const getCurrentStateOutput = z.object({
  refData: focusRefDataSchema.nullable(),
  currentBranch: z.string().nullable(),
});
