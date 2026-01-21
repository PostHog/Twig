import { z } from "zod";
import { container } from "../../di/container.js";
import { MAIN_TOKENS } from "../../di/tokens.js";
import {
  checkoutInput,
  findWorktreeInput,
  focusResultSchema,
  getCurrentStateOutput,
  mainRepoPathInput,
  reattachInput,
  repoPathInput,
  stashInput,
  stashResultSchema,
  syncInput,
  worktreeInput,
  writeRefInput,
} from "../../services/focus/schemas.js";
import type { FocusService } from "../../services/focus/service.js";
import type { FocusSyncService } from "../../services/focus/sync-service.js";
import { publicProcedure, router } from "../trpc.js";

const getService = () => container.get<FocusService>(MAIN_TOKENS.FocusService);
const getSyncService = () =>
  container.get<FocusSyncService>(MAIN_TOKENS.FocusSyncService);

export const focusRouter = router({
  getCurrentState: publicProcedure
    .input(mainRepoPathInput)
    .output(getCurrentStateOutput)
    .query(({ input }) => getService().getCurrentState(input.mainRepoPath)),

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

  findWorktreeByBranch: publicProcedure
    .input(findWorktreeInput)
    .output(z.string().nullable())
    .query(({ input }) =>
      getService().findWorktreeByBranch(input.mainRepoPath, input.branch),
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

  writeRef: publicProcedure
    .input(writeRefInput)
    .mutation(({ input }) =>
      getService().writeFocusRef(input.mainRepoPath, input.data),
    ),

  deleteRef: publicProcedure
    .input(mainRepoPathInput)
    .mutation(({ input }) => getService().deleteFocusRef(input.mainRepoPath)),

  startSync: publicProcedure
    .input(syncInput)
    .mutation(({ input }) =>
      getSyncService().startSync(input.mainRepoPath, input.worktreePath),
    ),

  stopSync: publicProcedure.mutation(() => getSyncService().stopSync()),

  focusLocal: publicProcedure
    .input(z.object({ mainRepoPath: z.string(), branch: z.string() }))
    .output(z.string().nullable())
    .mutation(({ input }) =>
      getService().focusLocal(input.mainRepoPath, input.branch),
    ),

  unfocusLocal: publicProcedure
    .input(mainRepoPathInput)
    .output(z.boolean())
    .mutation(({ input }) => getService().unfocusLocal(input.mainRepoPath)),

  isLocalFocused: publicProcedure
    .input(mainRepoPathInput)
    .output(z.boolean())
    .query(({ input }) => getService().isLocalFocused(input.mainRepoPath)),

  getLocalWorktreePath: publicProcedure
    .input(mainRepoPathInput)
    .output(z.string())
    .query(({ input }) =>
      getService().getLocalWorktreePath(input.mainRepoPath),
    ),
});
