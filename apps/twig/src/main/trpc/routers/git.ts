import { z } from "zod";
import { container } from "../../di/container.js";
import { MAIN_TOKENS } from "../../di/tokens.js";
import {
  cloneRepositoryInput,
  cloneRepositoryOutput,
  commitInput,
  commitOutput,
  createBranchInput,
  createPrInput,
  createPrOutput,
  detectRepoInput,
  detectRepoOutput,
  discardFileChangesInput,
  discardFileChangesOutput,
  generateCommitMessageInput,
  generateCommitMessageOutput,
  generatePrTitleAndBodyInput,
  generatePrTitleAndBodyOutput,
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
  getGitSyncStatusOutput,
  getLatestCommitInput,
  getLatestCommitOutput,
  getPrChangedFilesInput,
  getPrChangedFilesOutput,
  getPrTemplateInput,
  getPrTemplateOutput,
  ghStatusOutput,
  openPrInput,
  openPrOutput,
  prStatusInput,
  prStatusOutput,
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
    const iterable = service.toIterable(GitServiceEvent.CloneProgress, {
      signal: opts.signal,
    });
    for await (const data of iterable) {
      yield data;
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
    .output(discardFileChangesOutput)
    .mutation(({ input }) =>
      getService().discardFileChanges(
        input.directoryPath,
        input.filePath,
        input.fileStatus,
      ),
    ),

  // Sync status operations
  getGitSyncStatus: publicProcedure
    .input(
      z.object({
        directoryPath: z.string(),
        forceRefresh: z.boolean().optional(),
      }),
    )
    .output(getGitSyncStatusOutput)
    .query(({ input }) =>
      getService().getGitSyncStatus(input.directoryPath, input.forceRefresh),
    ),

  // Commit/repo info operations
  getLatestCommit: publicProcedure
    .input(getLatestCommitInput)
    .output(getLatestCommitOutput)
    .query(({ input }) => getService().getLatestCommit(input.directoryPath)),

  getGitRepoInfo: publicProcedure
    .input(getGitRepoInfoInput)
    .output(getGitRepoInfoOutput)
    .query(({ input }) => getService().getGitRepoInfo(input.directoryPath)),

  commit: publicProcedure
    .input(commitInput)
    .output(commitOutput)
    .mutation(({ input }) =>
      getService().commit(
        input.directoryPath,
        input.message,
        input.paths,
        input.allowEmpty,
      ),
    ),

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

  getGhStatus: publicProcedure
    .output(ghStatusOutput)
    .query(() => getService().getGhStatus()),

  getPrStatus: publicProcedure
    .input(prStatusInput)
    .output(prStatusOutput)
    .query(({ input }) => getService().getPrStatus(input.directoryPath)),

  createPr: publicProcedure
    .input(createPrInput)
    .output(createPrOutput)
    .mutation(({ input }) =>
      getService().createPr(
        input.directoryPath,
        input.title,
        input.body,
        input.draft,
      ),
    ),

  openPr: publicProcedure
    .input(openPrInput)
    .output(openPrOutput)
    .mutation(({ input }) => getService().openPr(input.directoryPath)),

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

  getPrChangedFiles: publicProcedure
    .input(getPrChangedFilesInput)
    .output(getPrChangedFilesOutput)
    .query(({ input }) => getService().getPrChangedFiles(input.prUrl)),

  generateCommitMessage: publicProcedure
    .input(generateCommitMessageInput)
    .output(generateCommitMessageOutput)
    .mutation(({ input }) =>
      getService().generateCommitMessage(
        input.directoryPath,
        input.credentials,
      ),
    ),

  generatePrTitleAndBody: publicProcedure
    .input(generatePrTitleAndBodyInput)
    .output(generatePrTitleAndBodyOutput)
    .mutation(({ input }) =>
      getService().generatePrTitleAndBody(
        input.directoryPath,
        input.credentials,
      ),
    ),
});
