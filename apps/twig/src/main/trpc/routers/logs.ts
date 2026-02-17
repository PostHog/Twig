import fs from "node:fs";
import path from "node:path";
import { app } from "electron";
import { z } from "zod";
import { logger } from "../../lib/logger";
import { publicProcedure, router } from "../trpc.js";

const log = logger.scope("logsRouter");

function getLocalLogPath(taskRunId: string): string {
  return path.join(
    app.getPath("home"),
    ".twig",
    "sessions",
    taskRunId,
    "logs.ndjson",
  );
}

export const logsRouter = router({
  fetchS3Logs: publicProcedure
    .input(z.object({ logUrl: z.string() }))
    .query(async ({ input }) => {
      try {
        const response = await fetch(input.logUrl);

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

  readLocalLogs: publicProcedure
    .input(z.object({ taskRunId: z.string() }))
    .query(async ({ input }) => {
      const logPath = getLocalLogPath(input.taskRunId);
      try {
        return await fs.promises.readFile(logPath, "utf-8");
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") {
          return null;
        }
        log.warn("Failed to read local logs:", error);
        return null;
      }
    }),

  writeLocalLogs: publicProcedure
    .input(z.object({ taskRunId: z.string(), content: z.string() }))
    .mutation(async ({ input }) => {
      const logPath = getLocalLogPath(input.taskRunId);
      const logDir = path.dirname(logPath);

      try {
        await fs.promises.mkdir(logDir, { recursive: true });
        await fs.promises.writeFile(logPath, input.content, "utf-8");
      } catch (error) {
        log.warn("Failed to write local logs:", error);
      }
    }),
});
