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

// Push operation
export const pushInput = z.object({
  directoryPath: z.string(),
  remote: z.string().default("origin"),
  branch: z.string().optional(),
  setUpstream: z.boolean().default(false),
});

export type PushInput = z.infer<typeof pushInput>;

// Pull operation
export const pullInput = z.object({
  directoryPath: z.string(),
  remote: z.string().default("origin"),
  branch: z.string().optional(),
});

export type PullInput = z.infer<typeof pullInput>;

// Commit operation
export const commitInput = z.object({
  directoryPath: z.string(),
  message: z.string(),
  paths: z.array(z.string()).optional(),
  allowEmpty: z.boolean().optional(),
});

export type CommitInput = z.infer<typeof commitInput>;

// GitHub CLI status
export const ghStatusOutput = z.object({
  installed: z.boolean(),
  version: z.string().nullable(),
  authenticated: z.boolean(),
  username: z.string().nullable(),
  error: z.string().nullable(),
});

export type GhStatusOutput = z.infer<typeof ghStatusOutput>;

// Pull request status
export const prStatusInput = directoryPathInput;
export const prStatusOutput = z.object({
  hasRemote: z.boolean(),
  isGitHubRepo: z.boolean(),
  currentBranch: z.string().nullable(),
  defaultBranch: z.string().nullable(),
  prExists: z.boolean(),
  prUrl: z.string().nullable(),
  prState: z.string().nullable(),
  baseBranch: z.string().nullable(),
  headBranch: z.string().nullable(),
  isDraft: z.boolean().nullable(),
  error: z.string().nullable(),
});

export type PrStatusInput = z.infer<typeof prStatusInput>;
export type PrStatusOutput = z.infer<typeof prStatusOutput>;

// Create PR operation
export const createPrInput = z.object({
  directoryPath: z.string(),
  title: z.string().optional(),
  body: z.string().optional(),
  draft: z.boolean().optional(),
});

export type CreatePrInput = z.infer<typeof createPrInput>;

// Open PR operation
export const openPrInput = directoryPathInput;
export const openPrOutput = z.object({
  success: z.boolean(),
  message: z.string(),
  prUrl: z.string().nullable(),
});

export type OpenPrInput = z.infer<typeof openPrInput>;
export type OpenPrOutput = z.infer<typeof openPrOutput>;

// Publish (push with upstream) operation
export const publishInput = z.object({
  directoryPath: z.string(),
  remote: z.string().default("origin"),
});

export type PublishInput = z.infer<typeof publishInput>;

// Sync (pull then push) operation
export const syncInput = z.object({
  directoryPath: z.string(),
  remote: z.string().default("origin"),
});

export type SyncInput = z.infer<typeof syncInput>;

// PR Template lookup
export const getPrTemplateInput = directoryPathInput;

export const getPrTemplateOutput = z.object({
  template: z.string().nullable(),
  templatePath: z.string().nullable(),
});

export type GetPrTemplateOutput = z.infer<typeof getPrTemplateOutput>;

// Commit conventions analysis
export const getCommitConventionsInput = z.object({
  directoryPath: z.string(),
  sampleSize: z.number().default(20),
});

export const getCommitConventionsOutput = z.object({
  conventionalCommits: z.boolean(),
  commonPrefixes: z.array(z.string()),
  sampleMessages: z.array(z.string()),
});

export type GetCommitConventionsOutput = z.infer<
  typeof getCommitConventionsOutput
>;

export const generateCommitMessageInput = z.object({
  directoryPath: z.string(),
  credentials: z.object({
    apiKey: z.string(),
    apiHost: z.string(),
  }),
});

export const generateCommitMessageOutput = z.object({
  message: z.string(),
});

export const generatePrTitleAndBodyInput = z.object({
  directoryPath: z.string(),
  credentials: z.object({
    apiKey: z.string(),
    apiHost: z.string(),
  }),
});

export const generatePrTitleAndBodyOutput = z.object({
  title: z.string(),
  body: z.string(),
});

export const gitStateSnapshotSchema = z.object({
  changedFiles: z.array(changedFileSchema).optional(),
  diffStats: diffStatsSchema.optional(),
  syncStatus: gitSyncStatusSchema.optional(),
  latestCommit: gitCommitInfoSchema.nullable().optional(),
  prStatus: prStatusOutput.optional(),
});

export type GitStateSnapshot = z.infer<typeof gitStateSnapshotSchema>;

export const commitOutput = z.object({
  success: z.boolean(),
  message: z.string(),
  commitSha: z.string().nullable(),
  branch: z.string().nullable(),
  state: gitStateSnapshotSchema.optional(),
});

export type CommitOutput = z.infer<typeof commitOutput>;

export const pushOutput = z.object({
  success: z.boolean(),
  message: z.string(),
  state: gitStateSnapshotSchema.optional(),
});

export type PushOutput = z.infer<typeof pushOutput>;

export const pullOutput = z.object({
  success: z.boolean(),
  message: z.string(),
  updatedFiles: z.number().optional(),
  state: gitStateSnapshotSchema.optional(),
});

export type PullOutput = z.infer<typeof pullOutput>;

export const publishOutput = z.object({
  success: z.boolean(),
  message: z.string(),
  branch: z.string(),
  state: gitStateSnapshotSchema.optional(),
});

export type PublishOutput = z.infer<typeof publishOutput>;

export const syncOutput = z.object({
  success: z.boolean(),
  pullMessage: z.string(),
  pushMessage: z.string(),
  state: gitStateSnapshotSchema.optional(),
});

export type SyncOutput = z.infer<typeof syncOutput>;

export const createPrOutput = z.object({
  success: z.boolean(),
  message: z.string(),
  prUrl: z.string().nullable(),
  state: gitStateSnapshotSchema.optional(),
});

export type CreatePrOutput = z.infer<typeof createPrOutput>;

export const discardFileChangesOutput = z.object({
  success: z.boolean(),
  state: gitStateSnapshotSchema.optional(),
});

export type DiscardFileChangesOutput = z.infer<typeof discardFileChangesOutput>;
