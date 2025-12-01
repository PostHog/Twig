import { type AgentEvent, parseAgentEvents } from "@posthog/agent";
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

  // Fetch and parse S3 logs
  ipcMain.handle(
    "fetch-s3-logs",
    async (
      _event: IpcMainInvokeEvent,
      logUrl: string,
    ): Promise<AgentEvent[]> => {
      try {
        log.debug("Fetching S3 logs from:", logUrl);
        const response = await fetch(logUrl);

        if (!response.ok) {
          throw new Error(
            `Failed to fetch logs: ${response.status} ${response.statusText}`,
          );
        }

        const content = await response.text();

        if (!content.trim()) {
          return [];
        }

        const rawEntries = content
          .trim()
          .split("\n")
          .map((line) => {
            try {
              return JSON.parse(line);
            } catch {
              return null;
            }
          })
          .filter(Boolean);

        return parseAgentEvents(rawEntries);
      } catch (error) {
        log.error("Failed to fetch S3 logs:", error);
        throw error;
      }
    },
  );
}
