import { type IpcMainInvokeEvent, ipcMain, safeStorage } from "electron";
import { logger } from "../lib/logger";

const log = logger.scope("posthog");

export function registerPosthogIpc(): void {
  // IPC handlers for secure storage
  ipcMain.handle(
    "store-api-key",
    async (_event: IpcMainInvokeEvent, apiKey: string): Promise<string> => {
      if (safeStorage.isEncryptionAvailable()) {
        const encrypted = safeStorage.encryptString(apiKey);
        return encrypted.toString("base64");
      }
      return apiKey;
    },
  );

  ipcMain.handle(
    "retrieve-api-key",
    async (
      _event: IpcMainInvokeEvent,
      encryptedKey: string,
    ): Promise<string | null> => {
      if (safeStorage.isEncryptionAvailable()) {
        try {
          const buffer = Buffer.from(encryptedKey, "base64");
          return safeStorage.decryptString(buffer);
        } catch {
          return null;
        }
      }
      return encryptedKey;
    },
  );

  ipcMain.handle(
    "fetch-s3-logs",
    async (
      _event: IpcMainInvokeEvent,
      logUrl: string,
    ): Promise<string | null> => {
      try {
        log.debug("Fetching S3 logs from:", logUrl);
        const response = await fetch(logUrl);

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
    },
  );
}
