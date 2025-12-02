import { type IpcMainInvokeEvent, ipcMain } from "electron";
import { logger } from "./logger";

type IpcHandler<T extends unknown[], R> = (
  event: IpcMainInvokeEvent,
  ...args: T
) => Promise<R> | R;

interface HandleOptions {
  scope?: string;
  rethrow?: boolean;
  fallback?: unknown;
}

export function createIpcHandler(scope: string) {
  const log = logger.scope(scope);

  return function handle<T extends unknown[], R>(
    channel: string,
    handler: IpcHandler<T, R>,
    options: HandleOptions = {},
  ): void {
    const { rethrow = true, fallback } = options;

    ipcMain.handle(channel, async (event: IpcMainInvokeEvent, ...args: T) => {
      try {
        return await handler(event, ...args);
      } catch (error) {
        log.error(`Failed to handle ${channel}:`, error);
        if (rethrow) {
          throw error;
        }
        return fallback as R;
      }
    });
  };
}
