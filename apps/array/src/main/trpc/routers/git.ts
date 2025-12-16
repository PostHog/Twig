import { z } from "zod";
import { container } from "../../di/container.js";
import { MAIN_TOKENS } from "../../di/tokens.js";
import type { GitService } from "../../services/git/service.js";
import { publicProcedure, router } from "../trpc.js";

const getService = () => container.get<GitService>(MAIN_TOKENS.GitService);

export const gitRouter = router({
  detectRepo: publicProcedure
    .input(z.object({ directoryPath: z.string() }))
    .query(({ input }) => {
      if (!input.directoryPath) return null;
      return getService().detectRepo(input.directoryPath);
    }),
});
