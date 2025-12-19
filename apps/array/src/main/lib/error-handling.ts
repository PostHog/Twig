import { ipcMain } from "electron";
import { logger } from "./logger.js";

export function initializeMainErrorHandling(): void {
  process.on("uncaughtException", (error) => {
    logger.error("Uncaught exception", error);
  });

  process.on("unhandledRejection", (reason) => {
    const error = reason instanceof Error ? reason : new Error(String(reason));
    logger.error("Unhandled rejection", error);
  });

  ipcMain.on(
    "preload-error",
    (_, error: { message: string; stack?: string }) => {
      logger.error("Preload error", error);
    },
  );
}
