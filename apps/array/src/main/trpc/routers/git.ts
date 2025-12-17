import { on } from "node:events";
import { container } from "../../di/container.js";
import { MAIN_TOKENS } from "../../di/tokens.js";
import {
  type CloneProgressPayload,
  cloneRepositoryInput,
  cloneRepositoryOutput,
  createBranchInput,
  detectRepoInput,
  detectRepoOutput,
  discardFileChangesInput,
  getAllBranchesInput,
  getAllBranchesOutput,
  getChangedFilesHeadInput,
  getChangedFilesHeadOutput,
  getCommitConventionsInput,
  getCommitConventionsOutput,
  getCurrentBranchInput,
  getCurrentBranchOutput,
  getDefaultBranchInput,
  getDefaultBranchOutput,
  getDiffStatsInput,
  getDiffStatsOutput,
  getFileAtHeadInput,
  getFileAtHeadOutput,
  getGitRepoInfoInput,
  getGitRepoInfoOutput,
  getGitSyncStatusInput,
  getGitSyncStatusOutput,
  getLatestCommitInput,
  getLatestCommitOutput,
  getPrTemplateInput,
  getPrTemplateOutput,
  publishInput,
  publishOutput,
  pullInput,
  pullOutput,
  pushInput,
  pushOutput,
  syncInput,
  syncOutput,
  validateRepoInput,
  validateRepoOutput,
} from "../../services/git/schemas.js";
import {
  type GitService,
  GitServiceEvent,
} from "../../services/git/service.js";
import { publicProcedure, router } from "../trpc.js";

const getService = () => container.get<GitService>(MAIN_TOKENS.GitService);

export const gitRouter = router({
  detectRepo: publicProcedure
    .input(detectRepoInput)
    .output(detectRepoOutput)
    .query(({ input }) => getService().detectRepo(input.directoryPath)),

  validateRepo: publicProcedure
    .input(validateRepoInput)
    .output(validateRepoOutput)
    .query(({ input }) => getService().validateRepo(input.directoryPath)),

  cloneRepository: publicProcedure
    .input(cloneRepositoryInput)
    .output(cloneRepositoryOutput)
    .mutation(({ input }) =>
      getService().cloneRepository(
        input.repoUrl,
        input.targetPath,
        input.cloneId,
      ),
    ),

  onCloneProgress: publicProcedure.subscription(async function* (opts) {
    const service = getService();
    const options = opts.signal ? { signal: opts.signal } : undefined;
    for await (const [payload] of on(
      service,
      GitServiceEvent.CloneProgress,
      options,
    )) {
      yield payload as CloneProgressPayload;
    }
  }),

  // Branch operations
  getCurrentBranch: publicProcedure
    .input(getCurrentBranchInput)
    .output(getCurrentBranchOutput)
    .query(({ input }) => getService().getCurrentBranch(input.directoryPath)),

  getDefaultBranch: publicProcedure
    .input(getDefaultBranchInput)
    .output(getDefaultBranchOutput)
    .query(({ input }) => getService().getDefaultBranch(input.directoryPath)),

  getAllBranches: publicProcedure
    .input(getAllBranchesInput)
    .output(getAllBranchesOutput)
    .query(({ input }) => getService().getAllBranches(input.directoryPath)),

  createBranch: publicProcedure
    .input(createBranchInput)
    .mutation(({ input }) =>
      getService().createBranch(input.directoryPath, input.branchName),
    ),

  // File change operations
  getChangedFilesHead: publicProcedure
    .input(getChangedFilesHeadInput)
    .output(getChangedFilesHeadOutput)
    .query(({ input }) =>
      getService().getChangedFilesHead(input.directoryPath),
    ),

  getFileAtHead: publicProcedure
    .input(getFileAtHeadInput)
    .output(getFileAtHeadOutput)
    .query(({ input }) =>
      getService().getFileAtHead(input.directoryPath, input.filePath),
    ),

  getDiffStats: publicProcedure
    .input(getDiffStatsInput)
    .output(getDiffStatsOutput)
    .query(({ input }) => getService().getDiffStats(input.directoryPath)),

  discardFileChanges: publicProcedure
    .input(discardFileChangesInput)
    .mutation(({ input }) =>
      getService().discardFileChanges(
        input.directoryPath,
        input.filePath,
        input.fileStatus,
      ),
    ),

  // Sync status operations
  getGitSyncStatus: publicProcedure
    .input(getGitSyncStatusInput)
    .output(getGitSyncStatusOutput)
    .query(({ input }) => getService().getGitSyncStatus(input.directoryPath)),

  // Commit/repo info operations
  getLatestCommit: publicProcedure
    .input(getLatestCommitInput)
    .output(getLatestCommitOutput)
    .query(({ input }) => getService().getLatestCommit(input.directoryPath)),

  getGitRepoInfo: publicProcedure
    .input(getGitRepoInfoInput)
    .output(getGitRepoInfoOutput)
    .query(({ input }) => getService().getGitRepoInfo(input.directoryPath)),

  push: publicProcedure
    .input(pushInput)
    .output(pushOutput)
    .mutation(({ input }) =>
      getService().push(
        input.directoryPath,
        input.remote,
        input.branch,
        input.setUpstream,
      ),
    ),

  pull: publicProcedure
    .input(pullInput)
    .output(pullOutput)
    .mutation(({ input }) =>
      getService().pull(input.directoryPath, input.remote, input.branch),
    ),

  publish: publicProcedure
    .input(publishInput)
    .output(publishOutput)
    .mutation(({ input }) =>
      getService().publish(input.directoryPath, input.remote),
    ),

  sync: publicProcedure
    .input(syncInput)
    .output(syncOutput)
    .mutation(({ input }) =>
      getService().sync(input.directoryPath, input.remote),
    ),

  getPrTemplate: publicProcedure
    .input(getPrTemplateInput)
    .output(getPrTemplateOutput)
    .query(({ input }) => getService().getPrTemplate(input.directoryPath)),

  getCommitConventions: publicProcedure
    .input(getCommitConventionsInput)
    .output(getCommitConventionsOutput)
    .query(({ input }) =>
      getService().getCommitConventions(input.directoryPath, input.sampleSize),
    ),
});
