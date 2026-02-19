import { app } from "electron";
import type { ScopedLogger } from "./logger.js";

export interface TimingCollector {
  time: <T>(label: string, fn: () => Promise<T>) => Promise<T>;
  timeSync: <T>(label: string, fn: () => T) => T;
  record: (label: string, ms: number) => void;
  summarize: (label: string) => void;
}

/**
 * Creates a timing collector that accumulates step durations and emits
 * a single consolidated log via summarize(). In packaged builds, returns
 * a no-op collector that passes through functions without measuring.
 */
export function createTimingCollector(log: ScopedLogger): TimingCollector {
  if (app.isPackaged) {
    return {
      time: <T>(_label: string, fn: () => Promise<T>) => fn(),
      timeSync: <T>(_label: string, fn: () => T) => fn(),
      record: () => {},
      summarize: () => {},
    };
  }

  const steps: Record<string, number> = {};

  return {
    async time<T>(label: string, fn: () => Promise<T>): Promise<T> {
      const start = Date.now();
      const result = await fn();
      steps[label] = Date.now() - start;
      return result;
    },
    timeSync<T>(label: string, fn: () => T): T {
      const start = Date.now();
      const result = fn();
      steps[label] = Date.now() - start;
      return result;
    },
    record(label: string, ms: number) {
      steps[label] = ms;
    },
    summarize(label: string) {
      const total = Object.values(steps).reduce((a, b) => a + b, 0);
      log.info(`[timing] ${label}: ${total}ms`, steps);
    },
  };
}
