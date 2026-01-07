import { container } from "../../di/container.js";
import { MAIN_TOKENS } from "../../di/tokens.js";
import {
  confirmDeleteTaskInput,
  confirmDeleteTaskOutput,
  fileContextMenuInput,
  fileContextMenuOutput,
  folderContextMenuInput,
  folderContextMenuOutput,
  splitContextMenuOutput,
  tabContextMenuInput,
  tabContextMenuOutput,
  taskContextMenuInput,
  taskContextMenuOutput,
} from "../../services/context-menu/schemas.js";
import type { ContextMenuService } from "../../services/context-menu/service.js";
import { publicProcedure, router } from "../trpc.js";

const getService = () =>
  container.get<ContextMenuService>(MAIN_TOKENS.ContextMenuService);

export const contextMenuRouter = router({
  confirmDeleteTask: publicProcedure
    .input(confirmDeleteTaskInput)
    .output(confirmDeleteTaskOutput)
    .mutation(({ input }) => getService().confirmDeleteTask(input)),

  showTaskContextMenu: publicProcedure
    .input(taskContextMenuInput)
    .output(taskContextMenuOutput)
    .mutation(({ input }) => getService().showTaskContextMenu(input)),

  showFolderContextMenu: publicProcedure
    .input(folderContextMenuInput)
    .output(folderContextMenuOutput)
    .mutation(({ input }) => getService().showFolderContextMenu(input)),

  showTabContextMenu: publicProcedure
    .input(tabContextMenuInput)
    .output(tabContextMenuOutput)
    .mutation(({ input }) => getService().showTabContextMenu(input)),

  showSplitContextMenu: publicProcedure
    .output(splitContextMenuOutput)
    .mutation(() => getService().showSplitContextMenu()),

  showFileContextMenu: publicProcedure
    .input(fileContextMenuInput)
    .output(fileContextMenuOutput)
    .mutation(({ input }) => getService().showFileContextMenu(input)),
});
