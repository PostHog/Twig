import { container } from "../../di/container.js";
import { MAIN_TOKENS } from "../../di/tokens.js";
import {
  disableFocusInput,
  disableFocusOutput,
  enableFocusInput,
  enableFocusOutput,
  restoreFocusInput,
  restoreFocusOutput,
} from "../../services/focus/schemas.js";
import type { FocusService } from "../../services/focus/service.js";
import { publicProcedure, router } from "../trpc.js";

const getService = () => container.get<FocusService>(MAIN_TOKENS.FocusService);

export const focusRouter = router({
  enable: publicProcedure
    .input(enableFocusInput)
    .output(enableFocusOutput)
    .mutation(({ input }) =>
      getService().enableFocus(
        input.workspaceId,
        input.mainRepoPath,
        input.worktreePath,
        input.branch,
      ),
    ),

  disable: publicProcedure
    .input(disableFocusInput)
    .output(disableFocusOutput)
    .mutation(({ input }) =>
      getService().disableFocus(
        input.mainRepoPath,
        input.worktreePath,
        input.branch,
      ),
    ),

  restore: publicProcedure
    .input(restoreFocusInput)
    .output(restoreFocusOutput)
    .mutation(({ input }) =>
      getService().restoreFocusState(input.mainRepoPath),
    ),
});
