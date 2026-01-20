import { z } from "zod";
import { container } from "../../di/container.js";
import { MAIN_TOKENS } from "../../di/tokens.js";
import {
  checkoutInput,
  findWorktreeInput,
  focusResultSchema,
  focusSessionSchema,
  mainRepoPathInput,
  reattachInput,
  repoPathInput,
  stashInput,
  stashResultSchema,
  syncInput,
  worktreeInput,
} from "../../services/focus/schemas.js";
import {
  type FocusService,
  FocusServiceEvent,
  type FocusServiceEvents,
} from "../../services/focus/service.js";
import type { FocusSyncService } from "../../services/focus/sync-service.js";
import { publicProcedure, router } from "../trpc.js";

const getService = () => container.get<FocusService>(MAIN_TOKENS.FocusService);
const getSyncService = () =>
  container.get<FocusSyncService>(MAIN_TOKENS.FocusSyncService);

function subscribe<K extends keyof FocusServiceEvents>(event: K) {
  return publicProcedure.subscription(async function* (opts) {
    const service = getService();
    const iterable = service.toIterable(event, { signal: opts.signal });
    for await (const data of iterable) {
      yield data;
    }
  });
}

export const focusRouter = router({
  getSession: publicProcedure
    .input(mainRepoPathInput)
    .output(focusSessionSchema.nullable())
    .query(({ input }) => getService().getSession(input.mainRepoPath)),

  saveSession: publicProcedure
    .input(focusSessionSchema)
    .mutation(({ input }) => getService().saveSession(input)),

  deleteSession: publicProcedure
    .input(mainRepoPathInput)
    .mutation(({ input }) => getService().deleteSession(input.mainRepoPath)),

  isFocusActive: publicProcedure
    .input(mainRepoPathInput)
    .output(z.boolean())
    .query(({ input }) => getService().isFocusActive(input.mainRepoPath)),

  validateFocusOperation: publicProcedure
    .input(
      z.object({
        mainRepoPath: z.string(),
        currentBranch: z.string().nullable(),
        targetBranch: z.string(),
      }),
    )
    .output(z.string().nullable())
    .query(({ input }) =>
      getService().validateFocusOperation(
        input.currentBranch,
        input.targetBranch,
      ),
    ),

  isDirty: publicProcedure
    .input(repoPathInput)
    .output(z.boolean())
    .query(({ input }) => getService().isDirty(input.repoPath)),

  getCommitSha: publicProcedure
    .input(repoPathInput)
    .output(z.string())
    .query(({ input }) => getService().getCommitSha(input.repoPath)),

  findWorktreeByBranch: publicProcedure
    .input(findWorktreeInput)
    .output(z.string().nullable())
    .query(({ input }) =>
      getService().findWorktreeByBranch(input.mainRepoPath, input.branch),
    ),

  toRelativeWorktreePath: publicProcedure
    .input(z.object({ absolutePath: z.string(), mainRepoPath: z.string() }))
    .output(z.string())
    .query(({ input }) =>
      getService().toRelativeWorktreePath(
        input.absolutePath,
        input.mainRepoPath,
      ),
    ),

  toAbsoluteWorktreePath: publicProcedure
    .input(z.object({ relativePath: z.string() }))
    .output(z.string())
    .query(({ input }) =>
      getService().toAbsoluteWorktreePath(input.relativePath),
    ),

  worktreeExistsAtPath: publicProcedure
    .input(z.object({ relativePath: z.string() }))
    .output(z.boolean())
    .query(({ input }) =>
      getService().worktreeExistsAtPath(input.relativePath),
    ),

  // Mutations
  stash: publicProcedure
    .input(stashInput)
    .output(stashResultSchema)
    .mutation(({ input }) => getService().stash(input.repoPath, input.message)),

  stashPop: publicProcedure
    .input(repoPathInput)
    .output(focusResultSchema)
    .mutation(({ input }) => getService().stashPop(input.repoPath)),

  stashApply: publicProcedure
    .input(z.object({ repoPath: z.string(), stashRef: z.string() }))
    .output(focusResultSchema)
    .mutation(({ input }) =>
      getService().stashApply(input.repoPath, input.stashRef),
    ),

  checkout: publicProcedure
    .input(checkoutInput)
    .output(focusResultSchema)
    .mutation(({ input }) =>
      getService().checkout(input.repoPath, input.branch),
    ),

  detachWorktree: publicProcedure
    .input(worktreeInput)
    .output(focusResultSchema)
    .mutation(({ input }) => getService().detachWorktree(input.worktreePath)),

  reattachWorktree: publicProcedure
    .input(reattachInput)
    .output(focusResultSchema)
    .mutation(({ input }) =>
      getService().reattachWorktree(input.worktreePath, input.branch),
    ),

  cleanWorkingTree: publicProcedure
    .input(repoPathInput)
    .mutation(({ input }) => getService().cleanWorkingTree(input.repoPath)),

  startSync: publicProcedure
    .input(syncInput)
    .mutation(({ input }) =>
      getSyncService().startSync(input.mainRepoPath, input.worktreePath),
    ),

  stopSync: publicProcedure.mutation(() => getSyncService().stopSync()),

  startWatchingMainRepo: publicProcedure
    .input(mainRepoPathInput)
    .mutation(({ input }) =>
      getService().startWatchingMainRepo(input.mainRepoPath),
    ),

  stopWatchingMainRepo: publicProcedure.mutation(() =>
    getService().stopWatchingMainRepo(),
  ),

  onBranchRenamed: subscribe(FocusServiceEvent.BranchRenamed),
  onForeignBranchCheckout: subscribe(FocusServiceEvent.ForeignBranchCheckout),
});
