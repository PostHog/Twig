import { app } from "electron";
import log from "electron-log/main";

// Initialize IPC transport to forward main process logs to renderer dev tools
log.initialize();

// Set levels - use debug in dev (check NODE_ENV since app.isPackaged may not be ready)
const isDev = process.env.NODE_ENV === "development" || !app.isPackaged;
const level = isDev ? "debug" : "info";
log.transports.file.level = level;
log.transports.console.level = level;
// IPC transport needs level set separately
log.transports.ipc.level = level;

export const logger = {
  info: (message: string, ...args: unknown[]) => log.info(message, ...args),
  warn: (message: string, ...args: unknown[]) => log.warn(message, ...args),
  error: (message: string, ...args: unknown[]) => log.error(message, ...args),
  debug: (message: string, ...args: unknown[]) => log.debug(message, ...args),

  scope: (name: string) => {
    const scoped = log.scope(name);
    return {
      info: (message: string, ...args: unknown[]) =>
        scoped.info(message, ...args),
      warn: (message: string, ...args: unknown[]) =>
        scoped.warn(message, ...args),
      error: (message: string, ...args: unknown[]) =>
        scoped.error(message, ...args),
      debug: (message: string, ...args: unknown[]) =>
        scoped.debug(message, ...args),
    };
  },
};

export type Logger = typeof logger;
export type ScopedLogger = ReturnType<typeof logger.scope>;
