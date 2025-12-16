import { container } from "../../di/container.js";
import { MAIN_TOKENS } from "../../di/tokens.js";
import {
  detectRepoInput,
  detectRepoOutput,
} from "../../services/git/schemas.js";
import type { GitService } from "../../services/git/service.js";
import { publicProcedure, router } from "../trpc.js";

const getService = () => container.get<GitService>(MAIN_TOKENS.GitService);

export const gitRouter = router({
  detectRepo: publicProcedure
    .input(detectRepoInput)
    .output(detectRepoOutput)
    .query(({ input }) => getService().detectRepo(input.directoryPath)),
});
