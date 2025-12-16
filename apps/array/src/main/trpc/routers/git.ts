import { on } from "node:events";
import { container } from "../../di/container.js";
import { MAIN_TOKENS } from "../../di/tokens.js";
import {
  type CloneProgressPayload,
  cloneRepositoryInput,
  cloneRepositoryOutput,
  detectRepoInput,
  detectRepoOutput,
  validateRepoInput,
  validateRepoOutput,
} from "../../services/git/schemas.js";
import {
  GitServiceEvent,
  type GitService,
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
      getService().cloneRepository(input.repoUrl, input.targetPath, input.cloneId),
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
});
