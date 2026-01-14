import type { Logger, ScopedLogger } from "@shared/lib/create-logger";
import { createLogger } from "@shared/lib/create-logger";
import { toast } from "@utils/toast";
import log from "electron-log/renderer";
import { IS_DEV } from "@/constants/environment";

log.transports.console.level = "debug";

const devErrorToastsEnabled =
  IS_DEV && import.meta.env.VITE_DEV_ERROR_TOASTS !== "false";

const emitToast = devErrorToastsEnabled
  ? (title: string, description?: string) => toast.error(title, { description })
  : undefined;

export const logger = createLogger(log, emitToast);
export type { Logger, ScopedLogger };
