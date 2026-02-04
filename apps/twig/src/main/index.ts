import "reflect-metadata";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { app } from "electron";
import log from "electron-log/main";
import "./lib/logger";
import "./services/index.js";
import { ANALYTICS_EVENTS } from "../types/analytics.js";
import { initializeDeepLinks, registerDeepLinkHandlers } from "./deep-links.js";
import { container } from "./di/container.js";
import { MAIN_TOKENS } from "./di/tokens.js";
import type { AppLifecycleService } from "./services/app-lifecycle/service.js";
import type { ExternalAppsService } from "./services/external-apps/service.js";
import type { NotificationService } from "./services/notification/service.js";
import type { OAuthService } from "./services/oauth/service.js";
import {
  captureException,
  initializePostHog,
  trackAppEvent,
} from "./services/posthog-analytics.js";
import type { TaskLinkService } from "./services/task-link/service";
import type { UpdatesService } from "./services/updates/service.js";
import type { WorkspaceService } from "./services/workspace/service.js";
import { migrateTaskAssociations } from "./utils/store.js";
import { createWindow } from "./window.js";

// Single instance lock must be acquired FIRST before any other app setup
const additionalData = process.defaultApp ? { argv: process.argv } : undefined;
const gotTheLock = app.requestSingleInstanceLock(additionalData);
if (!gotTheLock) {
  app.quit();
  process.exit(0);
}

// Register deep link handlers
registerDeepLinkHandlers();

// Ensure Claude config dir exists
function ensureClaudeConfigDir(): void {
  const existing = process.env.CLAUDE_CONFIG_DIR;
  if (existing) return;

  const userDataDir = app.getPath("userData");
  const claudeDir = path.join(userDataDir, "claude");

  mkdirSync(claudeDir, { recursive: true });
  process.env.CLAUDE_CONFIG_DIR = claudeDir;
}

function initializeServices(): void {
  // Initialize services that need early startup
  container.get<OAuthService>(MAIN_TOKENS.OAuthService);
  container.get<NotificationService>(MAIN_TOKENS.NotificationService);
  container.get<UpdatesService>(MAIN_TOKENS.UpdatesService);
  container.get<TaskLinkService>(MAIN_TOKENS.TaskLinkService);
  container.get<ExternalAppsService>(MAIN_TOKENS.ExternalAppsService);

  // Initialize PostHog analytics
  initializePostHog();
  trackAppEvent(ANALYTICS_EVENTS.APP_STARTED);

  // Initialize workspace branch watcher for live branch rename detection
  const workspaceService = container.get<WorkspaceService>(
    MAIN_TOKENS.WorkspaceService,
  );
  workspaceService.initBranchWatcher();
}

// ========================================================
// App lifecycle
// ========================================================

app.whenReady().then(() => {
  log.info(`Twig electron v${app.getVersion()} booting up`);
  migrateTaskAssociations();
  ensureClaudeConfigDir();
  createWindow();
  initializeServices();
  initializeDeepLinks();
});

app.on("window-all-closed", () => {
  app.quit();
});

app.on("before-quit", async (event) => {
  let lifecycleService: AppLifecycleService;
  try {
    lifecycleService = container.get<AppLifecycleService>(
      MAIN_TOKENS.AppLifecycleService,
    );
  } catch {
    // Container already torn down (e.g. second quit during shutdown), let Electron quit
    return;
  }

  // If quitting to install an update, don't block and let the updater handle it
  // we already gracefully shutdown the app in the updates service when the update is ready
  if (lifecycleService.isQuittingForUpdate) {
    return;
  }

  // If shutdown is already in progress, force-kill immediately
  if (lifecycleService.isShuttingDown) {
    lifecycleService.forceExit();
  }

  event.preventDefault();
  await lifecycleService.shutdownAndExit();
});

const handleShutdownSignal = async (signal: string) => {
  log.info(`Received ${signal}, starting shutdown`);
  try {
    const lifecycleService = container.get<AppLifecycleService>(
      MAIN_TOKENS.AppLifecycleService,
    );
    if (lifecycleService.isShuttingDown) {
      log.warn(`${signal} received during shutdown, forcing exit`);
      process.exit(1);
    }
    await lifecycleService.shutdown();
  } catch (_err) {
    // Container torn down or shutdown failed
  }
  process.exit(0);
};

// ========================================================
// Process signal handlers
// ========================================================

process.on("SIGTERM", () => handleShutdownSignal("SIGTERM"));
process.on("SIGINT", () => handleShutdownSignal("SIGINT"));
process.on("SIGHUP", () => handleShutdownSignal("SIGHUP"));

process.on("uncaughtException", (error) => {
  if (error.message === "write EIO") {
    // stdout/stderr pipe is broken (shutdown). Disable the console transport
    // so it stops hitting the broken pipe, then log to file.
    log.transports.console.level = false;
    log.error("Stdout pipe broken during shutdown (write EIO)");
    return;
  }
  log.error("Uncaught exception", error);

  captureException(error, { source: "main", type: "uncaughtException" });
});

process.on("unhandledRejection", (reason) => {
  log.error("Unhandled rejection", reason);

  const error = reason instanceof Error ? reason : new Error(String(reason));
  captureException(error, { source: "main", type: "unhandledRejection" });
});
