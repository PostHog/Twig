import { container } from "../../di/container.js";
import { MAIN_TOKENS } from "../../di/tokens.js";
import {
  addFolderInput,
  addFolderOutput,
  cleanupOrphanedWorktreesInput,
  cleanupOrphanedWorktreesOutput,
  getFoldersOutput,
  removeFolderInput,
  updateFolderAccessedInput,
} from "../../services/folders/schemas.js";
import type { FoldersService } from "../../services/folders/service.js";
import { publicProcedure, router } from "../trpc.js";

const getService = () =>
  container.get<FoldersService>(MAIN_TOKENS.FoldersService);

export const foldersRouter = router({
  getFolders: publicProcedure.output(getFoldersOutput).query(() => {
    return getService().getFolders();
  }),

  addFolder: publicProcedure
    .input(addFolderInput)
    .output(addFolderOutput)
    .mutation(({ input }) => {
      return getService().addFolder(input.folderPath);
    }),

  removeFolder: publicProcedure
    .input(removeFolderInput)
    .mutation(({ input }) => {
      return getService().removeFolder(input.folderId);
    }),

  updateFolderAccessed: publicProcedure
    .input(updateFolderAccessedInput)
    .mutation(({ input }) => {
      return getService().updateFolderAccessed(input.folderId);
    }),

  cleanupOrphanedWorktrees: publicProcedure
    .input(cleanupOrphanedWorktreesInput)
    .output(cleanupOrphanedWorktreesOutput)
    .mutation(({ input }) => {
      return getService().cleanupOrphanedWorktrees(input.mainRepoPath);
    }),

  clearAllData: publicProcedure.mutation(() => {
    return getService().clearAllData();
  }),
});
