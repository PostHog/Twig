import { formatArgsToString } from "@shared/utils/format";
import { toast } from "@utils/toast";
import { IS_DEV } from "@/constants/environment";
import { logger } from "./logger";

const devErrorToastsEnabled =
  IS_DEV && import.meta.env.VITE_DEV_ERROR_TOASTS !== "false";

export function initializeRendererErrorHandling(): void {
  if (devErrorToastsEnabled) {
    interceptConsole();
  }

  window.addEventListener("error", (event) => {
    const message = event.error?.message || event.message || "Unknown error";
    logger.error("Uncaught error", event.error || message);
    if (!devErrorToastsEnabled) {
      toast.error("An unexpected error occurred", { description: message });
    }
  });

  window.addEventListener("unhandledrejection", (event) => {
    const message =
      event.reason instanceof Error
        ? event.reason.message
        : String(event.reason || "Unknown error");
    logger.error("Unhandled rejection", event.reason);
    if (!devErrorToastsEnabled) {
      toast.error("An unexpected error occurred", { description: message });
    }
  });
}

function interceptConsole(): void {
  const { error: originalError, warn: originalWarn } = console;

  console.error = (...args: unknown[]) => {
    originalError.apply(console, args);
    toast.error("[DEV] Console error", {
      description: formatArgsToString(args),
    });
  };

  console.warn = (...args: unknown[]) => {
    originalWarn.apply(console, args);
    toast.warning("[DEV] Console warning", {
      description: formatArgsToString(args),
    });
  };
}
