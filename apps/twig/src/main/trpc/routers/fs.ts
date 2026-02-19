import { container } from "../../di/container.js";
import { MAIN_TOKENS } from "../../di/tokens.js";
import {
  getFileStatsInput,
  getFileStatsOutput,
  listRepoFilesInput,
  listRepoFilesOutput,
  readRepoFileInput,
  readRepoFileOutput,
  writeRepoFileInput,
} from "../../services/fs/schemas.js";
import type { FsService } from "../../services/fs/service.js";
import { publicProcedure, router } from "../trpc.js";

const getService = () => container.get<FsService>(MAIN_TOKENS.FsService);

export const fsRouter = router({
  listRepoFiles: publicProcedure
    .input(listRepoFilesInput)
    .output(listRepoFilesOutput)
    .query(({ input }) =>
      getService().listRepoFiles(input.repoPath, input.query, input.limit),
    ),

  readRepoFile: publicProcedure
    .input(readRepoFileInput)
    .output(readRepoFileOutput)
    .query(({ input }) =>
      getService().readRepoFile(input.repoPath, input.filePath),
    ),

  writeRepoFile: publicProcedure
    .input(writeRepoFileInput)
    .mutation(({ input }) =>
      getService().writeRepoFile(input.repoPath, input.filePath, input.content),
    ),

  getFileStats: publicProcedure
    .input(getFileStatsInput)
    .output(getFileStatsOutput)
    .query(({ input }) =>
      getService().getFileStats(input.repoPath, input.filePath),
    ),
});
