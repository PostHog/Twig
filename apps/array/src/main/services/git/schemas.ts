import { z } from "zod";

// Common schemas
export const directoryPathInput = z.object({
  directoryPath: z.string(),
});

export const gitFileStatusSchema = z.enum([
  "modified",
  "added",
  "deleted",
  "renamed",
  "untracked",
]);

export type GitFileStatus = z.infer<typeof gitFileStatusSchema>;

export const changedFileSchema = z.object({
  path: z.string(),
  status: gitFileStatusSchema,
  originalPath: z.string().optional(),
  linesAdded: z.number().optional(),
  linesRemoved: z.number().optional(),
});

export type ChangedFile = z.infer<typeof changedFileSchema>;

export const diffStatsSchema = z.object({
  filesChanged: z.number(),
  linesAdded: z.number(),
  linesRemoved: z.number(),
});

export type DiffStats = z.infer<typeof diffStatsSchema>;

export const gitSyncStatusSchema = z.object({
  ahead: z.number(),
  behind: z.number(),
  hasRemote: z.boolean(),
  currentBranch: z.string().nullable(),
  isFeatureBranch: z.boolean(),
});

export type GitSyncStatus = z.infer<typeof gitSyncStatusSchema>;

export const gitCommitInfoSchema = z.object({
  sha: z.string(),
  shortSha: z.string(),
  message: z.string(),
  author: z.string(),
  date: z.string(),
});

export type GitCommitInfo = z.infer<typeof gitCommitInfoSchema>;

export const gitRepoInfoSchema = z.object({
  organization: z.string(),
  repository: z.string(),
  currentBranch: z.string().nullable(),
  defaultBranch: z.string(),
  compareUrl: z.string().nullable(),
});

export type GitRepoInfo = z.infer<typeof gitRepoInfoSchema>;

// detectRepo schemas
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

// getChangedFilesHead schemas
export const getChangedFilesHeadInput = directoryPathInput;
export const getChangedFilesHeadOutput = z.array(changedFileSchema);

// getFileAtHead schemas
export const getFileAtHeadInput = z.object({
  directoryPath: z.string(),
  filePath: z.string(),
});
export const getFileAtHeadOutput = z.string().nullable();

// getDiffStats schemas
export const getDiffStatsInput = directoryPathInput;
export const getDiffStatsOutput = diffStatsSchema;

// getCurrentBranch schemas
export const getCurrentBranchInput = directoryPathInput;
export const getCurrentBranchOutput = z.string().nullable();

// getDefaultBranch schemas
export const getDefaultBranchInput = directoryPathInput;
export const getDefaultBranchOutput = z.string();

// getAllBranches schemas
export const getAllBranchesInput = directoryPathInput;
export const getAllBranchesOutput = z.array(z.string());

// createBranch schemas
export const createBranchInput = z.object({
  directoryPath: z.string(),
  branchName: z.string(),
});

// discardFileChanges schemas
export const discardFileChangesInput = z.object({
  directoryPath: z.string(),
  filePath: z.string(),
  fileStatus: gitFileStatusSchema,
});

// getGitSyncStatus schemas
export const getGitSyncStatusInput = directoryPathInput;
export const getGitSyncStatusOutput = gitSyncStatusSchema;

// getLatestCommit schemas
export const getLatestCommitInput = directoryPathInput;
export const getLatestCommitOutput = gitCommitInfoSchema.nullable();

// getGitRepoInfo schemas
export const getGitRepoInfoInput = directoryPathInput;
export const getGitRepoInfoOutput = gitRepoInfoSchema.nullable();
