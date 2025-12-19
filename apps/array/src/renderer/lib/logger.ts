import type { Logger, ScopedLogger } from "@shared/lib/create-logger";
import { createLogger } from "@shared/lib/create-logger";
import { toast } from "@utils/toast";
import log from "electron-log/renderer";

log.transports.console.level = "debug";

const isDev = import.meta.env.DEV;
const devErrorToastsEnabled =
  isDev && import.meta.env.VITE_DEV_ERROR_TOASTS !== "false";

const emitToast = devErrorToastsEnabled
  ? (title: string, description?: string) => toast.error(title, { description })
  : undefined;

export const logger = createLogger(log, emitToast);
export type { Logger, ScopedLogger };
