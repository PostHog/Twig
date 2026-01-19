import { z } from "zod";
import { logger } from "../../lib/logger";
import { publicProcedure, router } from "../trpc.js";

const log = logger.scope("logsRouter");

export const logsRouter = router({
  /**
   * Fetch logs from S3 using presigned URL
   */
  fetchS3Logs: publicProcedure
    .input(z.object({ logUrl: z.string() }))
    .query(async ({ input }) => {
      try {
        const response = await fetch(input.logUrl);

        // 404 is expected for new task runs - file doesn't exist yet
        if (response.status === 404) {
          return null;
        }

        if (!response.ok) {
          log.warn(
            "Failed to fetch S3 logs:",
            response.status,
            response.statusText,
          );
          return null;
        }

        return await response.text();
      } catch (error) {
        log.error("Failed to fetch S3 logs:", error);
        return null;
      }
    }),
});
