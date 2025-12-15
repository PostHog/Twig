import { z } from "zod";
import { get } from "@/main/di/container.js";
import { MAIN_TOKENS } from "@/main/di/tokens.js";
import type { GitService } from "@/main/services/git/service.js";
import { publicProcedure, router } from "../trpc.js";

export const gitRouter = router({
  detectRepo: publicProcedure
    .input(z.object({ directoryPath: z.string() }))
    .query(async ({ input }) => {
      if (!input.directoryPath) return null;

      const gitService = get<GitService>(MAIN_TOKENS.GitService);
      if (!gitService) return null;

      return gitService.detectRepo(input.directoryPath);
    }),
});
