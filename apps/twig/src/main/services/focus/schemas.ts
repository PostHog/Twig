import { z } from "zod";

// Base result type for git operations
export interface GitOperationResult {
  success: boolean;
  error?: string;
}

export interface StashResult extends GitOperationResult {
  stashRef?: string;
}

// Zod schemas for tRPC
const focusDisabledSchema = z.object({
  enabled: z.literal(false),
});

const focusEnabledSchema = z.object({
  enabled: z.literal(true),
  workspaceId: z.string(),
  branch: z.string(),
  mainRepoPath: z.string(),
  worktreePath: z.string(),
  originalBranch: z.string(),
  mainStashRef: z.string().nullable(),
});

export const focusStateSchema = z.discriminatedUnion("enabled", [
  focusDisabledSchema,
  focusEnabledSchema,
]);

export const focusResultSchema = z.object({
  success: z.boolean(),
  error: z.string().optional(),
  stashed: z.boolean().optional(),
  returnedToBranch: z.string().optional(),
});

export const enableFocusInput = z.object({
  workspaceId: z.string(),
  mainRepoPath: z.string(),
  worktreePath: z.string(),
  branch: z.string(),
});

export const disableFocusInput = z.object({
  mainRepoPath: z.string(),
  worktreePath: z.string(),
  branch: z.string(),
});
export const restoreFocusInput = z.object({ mainRepoPath: z.string() });

export const enableFocusOutput = focusResultSchema;
export const disableFocusOutput = focusResultSchema;
export const restoreFocusOutput = focusResultSchema;

export type FocusState = z.infer<typeof focusStateSchema>;
export type FocusEnabledState = z.infer<typeof focusEnabledSchema>;
export type FocusResult = z.infer<typeof focusResultSchema>;
export type EnableFocusInput = z.infer<typeof enableFocusInput>;

// Saga types derived from FocusEnabledState
export type EnableFocusSagaInput = Omit<
  FocusEnabledState,
  "enabled" | "workspaceId" | "mainStashRef"
>;

export type DisableFocusSagaInput = Omit<
  FocusEnabledState,
  "enabled" | "workspaceId"
>;

export interface EnableFocusSagaOutput {
  mainStashRef: string | null;
}

export interface DisableFocusSagaOutput {
  stashPopWarning?: string;
}

// Git ref persistence - minimal data that can't be derived from git
export const focusRefDataSchema = z.object({
  originalBranch: z.string(),
  mainStashRef: z.string().nullable(),
});

export type FocusRefData = z.infer<typeof focusRefDataSchema>;
