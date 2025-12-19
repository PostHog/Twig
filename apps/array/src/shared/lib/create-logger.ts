import { formatErrorDescription } from "@shared/utils/format";

type LogFn = (message: string, ...args: unknown[]) => void;

interface BaseLog {
  info: LogFn;
  warn: LogFn;
  error: LogFn;
  debug: LogFn;
  scope: (name: string) => {
    info: LogFn;
    warn: LogFn;
    error: LogFn;
    debug: LogFn;
  };
}

export interface ScopedLogger {
  info: LogFn;
  warn: LogFn;
  error: LogFn;
  debug: LogFn;
  scope: (name: string) => ScopedLogger;
}

export interface Logger extends ScopedLogger {
  setDevToastEmitter: (emitter: DevToastEmitter | undefined) => void;
}

export type DevToastEmitter = (title: string, description?: string) => void;

export function createLogger(
  log: BaseLog,
  initialEmitter?: DevToastEmitter,
): Logger {
  let emitToast = initialEmitter;

  const createScopedLogger = (
    scoped: { info: LogFn; warn: LogFn; error: LogFn; debug: LogFn },
    name: string,
  ): ScopedLogger => ({
    info: scoped.info,
    warn: scoped.warn,
    debug: scoped.debug,
    error: (message, ...args) => {
      scoped.error(message, ...args);
      emitToast?.(`[DEV] [${name}] ${message}`, formatErrorDescription(args));
    },
    scope: (subName) =>
      createScopedLogger(log.scope(`${name}:${subName}`), `${name}:${subName}`),
  });

  return {
    info: log.info,
    warn: log.warn,
    debug: log.debug,
    error: (message, ...args) => {
      log.error(message, ...args);
      emitToast?.(`[DEV] ${message}`, formatErrorDescription(args));
    },
    scope: (name) => createScopedLogger(log.scope(name), name),
    setDevToastEmitter: (emitter) => {
      emitToast = emitter;
    },
  };
}
