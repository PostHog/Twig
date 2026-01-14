import type { ScopedLogger } from "./logger.js";

/**
 * Creates a timing helper that logs execution duration.
 * @param log - Scoped logger to use for timing output
 * @returns A function that times async operations and logs the result
 */
export function createTimer(log: ScopedLogger) {
  return async <T>(label: string, fn: () => Promise<T>): Promise<T> => {
    const start = Date.now();
    const result = await fn();
    log.info(`[timing] ${label}: ${Date.now() - start}ms`);
    return result;
  };
}
