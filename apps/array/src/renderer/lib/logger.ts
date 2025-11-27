import log from "electron-log/renderer";

// Ensure logs appear in dev tools console
log.transports.console.level = "debug";

export const logger = {
  info: (message: string, ...args: unknown[]) => log.info(message, ...args),
  warn: (message: string, ...args: unknown[]) => log.warn(message, ...args),
  error: (message: string, ...args: unknown[]) => log.error(message, ...args),
  debug: (message: string, ...args: unknown[]) => log.debug(message, ...args),

  scope: (name: string) => {
    const scoped = log.scope(name);
    return {
      info: (message: string, ...args: unknown[]) => scoped.info(message, ...args),
      warn: (message: string, ...args: unknown[]) => scoped.warn(message, ...args),
      error: (message: string, ...args: unknown[]) => scoped.error(message, ...args),
      debug: (message: string, ...args: unknown[]) => scoped.debug(message, ...args),
    };
  },
};

export type Logger = typeof logger;
export type ScopedLogger = ReturnType<typeof logger.scope>;
