import { z } from "zod";
import { container } from "../../di/container.js";
import { MAIN_TOKENS } from "../../di/tokens.js";
import type { ContextMenuService } from "../../services/context-menu/service.js";
import { publicProcedure, router } from "../trpc.js";

const getService = () =>
  container.get<ContextMenuService>(MAIN_TOKENS.ContextMenuService);

export const contextMenuRouter = router({
  showTaskContextMenu: publicProcedure
    .input(
      z.object({ taskTitle: z.string(), worktreePath: z.string().optional() }),
    )
    .mutation(({ input }) => getService().showTaskContextMenu(input)),

  showFolderContextMenu: publicProcedure
    .input(
      z.object({ folderName: z.string(), folderPath: z.string().optional() }),
    )
    .mutation(({ input }) => getService().showFolderContextMenu(input)),

  showTabContextMenu: publicProcedure
    .input(z.object({ canClose: z.boolean(), filePath: z.string().optional() }))
    .mutation(({ input }) => getService().showTabContextMenu(input)),

  showSplitContextMenu: publicProcedure.mutation(() =>
    getService().showSplitContextMenu(),
  ),

  showFileContextMenu: publicProcedure
    .input(
      z.object({
        filePath: z.string(),
        showCollapseAll: z.boolean().optional(),
      }),
    )
    .mutation(({ input }) => getService().showFileContextMenu(input)),
});
