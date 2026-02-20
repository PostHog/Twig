import { createTimingCollector, type TimingCollector } from "@posthog/shared";
import { app } from "electron";
import type { ScopedLogger } from "./logger.js";

export type { TimingCollector };

/**
 * Creates a timing collector for the main process.
 * No-op in packaged (production) builds.
 */
export function createMainTimingCollector(log: ScopedLogger): TimingCollector {
  return createTimingCollector(!app.isPackaged, (msg, data) =>
    log.info(msg, data),
  );
}
