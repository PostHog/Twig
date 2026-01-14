import type { Logger, ScopedLogger } from "@shared/lib/create-logger.js";
import { createLogger } from "@shared/lib/create-logger.js";
import { app } from "electron";
import log from "electron-log/main";

log.initialize();

const isDev = process.env.NODE_ENV === "development" || !app.isPackaged;
const level = isDev ? "debug" : "info";
log.transports.file.level = level;
log.transports.console.level = level;
log.transports.ipc.level = level;

export const logger = createLogger(log);
export type { Logger, ScopedLogger };
