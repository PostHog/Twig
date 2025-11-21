import { type IpcMainInvokeEvent, ipcMain, safeStorage } from "electron";

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

  // Fetch S3 logs
  ipcMain.handle(
    "fetch-s3-logs",
    async (_event: IpcMainInvokeEvent, logUrl: string): Promise<string> => {
      try {
        console.log("Fetching S3 logs from:", logUrl);
        const response = await fetch(logUrl);

        if (!response.ok) {
          throw new Error(
            `Failed to fetch logs: ${response.status} ${response.statusText}`,
          );
        }

        const content = await response.text();
        console.log("S3 logs fetched:", content);
        return content;
      } catch (error) {
        console.error("Failed to fetch S3 logs:", error);
        throw error;
      }
    },
  );
}
