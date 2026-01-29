import { app } from "electron";
import { container } from "./di/container.js";
import { MAIN_TOKENS } from "./di/tokens.js";
import type { DeepLinkService } from "./services/deep-link/service.js";
import { focusMainWindow } from "./window.js";

let pendingDeepLinkUrl: string | null = null;

function getDeepLinkService(): DeepLinkService {
  return container.get<DeepLinkService>(MAIN_TOKENS.DeepLinkService);
}

/**
 * Register app-level deep link event handlers.
 * Must be called before app.whenReady() so macOS open-url events are captured.
 */
export function registerDeepLinkHandlers(): void {
  // Handle deep link URLs on macOS
  app.on("open-url", (event, url) => {
    event.preventDefault();

    if (!app.isReady()) {
      pendingDeepLinkUrl = url;
      return;
    }

    getDeepLinkService().handleUrl(url);
    focusMainWindow();
  });

  // Handle deep link URLs on Windows/Linux (second instance sends URL via command line)
  app.on("second-instance", (_event, commandLine) => {
    const url = commandLine.find(
      (arg) => arg.startsWith("twig://") || arg.startsWith("array://"),
    );
    if (url) {
      getDeepLinkService().handleUrl(url);
    }

    focusMainWindow();
  });
}

/**
 * Register the deep link protocol and process any URLs that arrived before
 * the app was ready.
 * Must be called after app.whenReady().
 */
export function initializeDeepLinks(): void {
  getDeepLinkService().registerProtocol();

  if (process.platform === "darwin") {
    if (pendingDeepLinkUrl) {
      getDeepLinkService().handleUrl(pendingDeepLinkUrl);
      pendingDeepLinkUrl = null;
    }
  } else {
    const deepLinkUrl = process.argv.find(
      (arg) => arg.startsWith("twig://") || arg.startsWith("array://"),
    );
    if (deepLinkUrl) {
      getDeepLinkService().handleUrl(deepLinkUrl);
    }
  }
}
