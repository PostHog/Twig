declare const __BUILD_COMMIT__: string | undefined;
declare const __BUILD_DATE__: string | undefined;

import { fixPath } from "./lib/fixPath.js";

// Call fixPath early to ensure PATH is correct for any child processes
fixPath();

import "reflect-metadata";
import dns from "node:dns";

import { mkdirSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createIPCHandler } from "@posthog/electron-trpc/main";
import {
  app,
  BrowserWindow,
  clipboard,
  dialog,
  Menu,
  type MenuItemConstructorOptions,
  shell,
} from "electron";
import "./lib/logger";
import { ANALYTICS_EVENTS } from "../types/analytics.js";
import { container } from "./di/container.js";
import { MAIN_TOKENS } from "./di/tokens.js";
import type { AgentService } from "./services/agent/service.js";
import type { DockBadgeService } from "./services/dock-badge/service.js";
import type { UIService } from "./services/ui/service.js";
import { setMainWindowGetter } from "./trpc/context.js";
import { trpcRouter } from "./trpc/index.js";

import "./services/index.js";
import type { DeepLinkService } from "./services/deep-link/service.js";
import type { ExternalAppsService } from "./services/external-apps/service.js";
import type { OAuthService } from "./services/oauth/service.js";
import {
  initializePostHog,
  shutdownPostHog,
  trackAppEvent,
} from "./services/posthog-analytics.js";
import type { TaskLinkService } from "./services/task-link/service";
import type { UpdatesService } from "./services/updates/service.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

declare const MAIN_WINDOW_VITE_DEV_SERVER_URL: string | undefined;
declare const MAIN_WINDOW_VITE_NAME: string;

let mainWindow: BrowserWindow | null = null;

// Force IPv4 resolution when "localhost" is used so the agent hits 127.0.0.1
// instead of ::1. This matches how the renderer already reaches the PostHog API.
dns.setDefaultResultOrder("ipv4first");

// Set app name to ensure consistent userData path across platforms
app.setName("Array");

// Single instance lock must be acquired FIRST before any other app setup
// This ensures deep links go to the existing instance, not a new one
// In development, we need to pass the same args that setAsDefaultProtocolClient uses
const additionalData = process.defaultApp ? { argv: process.argv } : undefined;
const gotTheLock = app.requestSingleInstanceLock(additionalData);
if (!gotTheLock) {
  app.quit();
  // Must exit immediately to prevent any further initialization
  process.exit(0);
}

// Queue to hold deep link URLs received before app is ready
let pendingDeepLinkUrl: string | null = null;

// Handle deep link URLs on macOS - must be registered before app is ready
app.on("open-url", (event, url) => {
  event.preventDefault();

  // If the app isn't ready yet, queue the URL for later processing
  if (!app.isReady()) {
    pendingDeepLinkUrl = url;
    return;
  }

  const deepLinkService = container.get<DeepLinkService>(
    MAIN_TOKENS.DeepLinkService,
  );
  deepLinkService.handleUrl(url);

  // Focus the main window when receiving a deep link
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  }
});

// Handle deep link URLs on Windows/Linux (second instance sends URL via command line)
app.on("second-instance", (_event, commandLine) => {
  const url = commandLine.find((arg) => arg.startsWith("array://"));
  if (url) {
    const deepLinkService = container.get<DeepLinkService>(
      MAIN_TOKENS.DeepLinkService,
    );
    deepLinkService.handleUrl(url);
  }

  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  }
});

function ensureClaudeConfigDir(): void {
  const existing = process.env.CLAUDE_CONFIG_DIR;
  if (existing) return;

  const userDataDir = app.getPath("userData");
  const claudeDir = path.join(userDataDir, "claude");

  mkdirSync(claudeDir, { recursive: true });
  process.env.CLAUDE_CONFIG_DIR = claudeDir;
}

function setupExternalLinkHandlers(window: BrowserWindow): void {
  window.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });

  window.webContents.on("will-navigate", (event, url) => {
    const appUrl = MAIN_WINDOW_VITE_DEV_SERVER_URL || "file://";
    if (!url.startsWith(appUrl)) {
      event.preventDefault();
      shell.openExternal(url);
    }
  });
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 900,
    height: 600,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: "#0a0a0a",
    titleBarStyle: "hiddenInset",
    show: false,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: true,
      preload: path.join(__dirname, "preload.js"),
      enableBlinkFeatures: "GetDisplayMedia",
      partition: "persist:main",
    },
  });

  mainWindow.once("ready-to-show", () => {
    mainWindow?.maximize();
    mainWindow?.show();
  });

  setMainWindowGetter(() => mainWindow);
  createIPCHandler({ router: trpcRouter, windows: [mainWindow] });

  setupExternalLinkHandlers(mainWindow);

  // Set up menu for keyboard shortcuts
  const template: MenuItemConstructorOptions[] = [
    {
      label: "Array",
      submenu: [
        {
          label: "About Array",
          click: () => {
            const commit = __BUILD_COMMIT__ ?? "dev";
            const buildDate = __BUILD_DATE__ ?? "dev";
            const info = [
              `Version: ${app.getVersion()}`,
              `Commit: ${commit}`,
              `Date: ${buildDate}`,
              `Electron: ${process.versions.electron}`,
              `Chromium: ${process.versions.chrome}`,
              `Node.js: ${process.versions.node}`,
              `V8: ${process.versions.v8}`,
              `OS: ${process.platform} ${process.arch} ${os.release()}`,
            ].join("\n");

            dialog
              .showMessageBox({
                type: "info",
                title: "About Array",
                message: "Array",
                detail: info,
                buttons: ["Copy", "OK"],
                defaultId: 1,
              })
              .then((result) => {
                if (result.response === 0) {
                  clipboard.writeText(info);
                }
              });
          },
        },
        { type: "separator" },
        ...(app.isPackaged
          ? [
              {
                label: "Check for Updates...",
                click: () => {
                  const updatesService = container.get<UpdatesService>(
                    MAIN_TOKENS.UpdatesService,
                  );
                  updatesService.triggerMenuCheck();
                },
              },
            ]
          : []),
        { type: "separator" },
        { role: "hide" },
        { role: "hideOthers" },
        { role: "unhide" },
        { type: "separator" },
        {
          label: "Settings...",
          accelerator: "CmdOrCtrl+,",
          click: () => {
            container.get<UIService>(MAIN_TOKENS.UIService).openSettings();
          },
        },
        { type: "separator" },
        { role: "quit" },
      ],
    },
    {
      label: "File",
      submenu: [
        {
          label: "New task",
          accelerator: "CmdOrCtrl+N",
          click: () => {
            container.get<UIService>(MAIN_TOKENS.UIService).newTask();
          },
        },
        { type: "separator" },
        {
          label: "Developer",
          submenu: [
            {
              label: "Clear application storage",
              click: () => {
                container.get<UIService>(MAIN_TOKENS.UIService).clearStorage();
              },
            },
          ],
        },
      ],
    },
    {
      label: "Edit",
      submenu: [
        { role: "undo" },
        { role: "redo" },
        { type: "separator" },
        { role: "cut" },
        { role: "copy" },
        { role: "paste" },
        { role: "selectAll" },
      ],
    },
    {
      label: "View",
      submenu: [
        { role: "reload" },
        { role: "forceReload" },
        { role: "toggleDevTools" },
        { type: "separator" },
        { role: "resetZoom" },
        { role: "zoomIn" },
        { role: "zoomOut" },
        { type: "separator" },
        { role: "togglefullscreen" },
        { type: "separator" },
        {
          label: "Reset layout",
          click: () => {
            container.get<UIService>(MAIN_TOKENS.UIService).resetLayout();
          },
        },
      ],
    },
    {
      label: "Window",
      submenu: [
        { role: "minimize" },
        { role: "zoom" },
        { type: "separator" },
        { role: "front" },
      ],
    },
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);

  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(
      path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`),
    );
  }

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  createWindow();
  ensureClaudeConfigDir();

  // Initialize deep link service and register protocol
  const deepLinkService = container.get<DeepLinkService>(
    MAIN_TOKENS.DeepLinkService,
  );
  deepLinkService.registerProtocol();

  // Initialize OAuth service (registers its deep link handler)
  container.get<OAuthService>(MAIN_TOKENS.OAuthService);

  // Initialize services that need early startup
  container.get<DockBadgeService>(MAIN_TOKENS.DockBadgeService);
  container.get<UpdatesService>(MAIN_TOKENS.UpdatesService);
  container.get<TaskLinkService>(MAIN_TOKENS.TaskLinkService);

  // Initialize PostHog analytics
  initializePostHog();
  trackAppEvent(ANALYTICS_EVENTS.APP_STARTED);

  // Preload external app icons in background
  container.get<ExternalAppsService>(MAIN_TOKENS.ExternalAppsService);

  // Handle case where app was launched by a deep link
  if (process.platform === "darwin") {
    // On macOS, the open-url event may have fired before app was ready
    if (pendingDeepLinkUrl) {
      deepLinkService.handleUrl(pendingDeepLinkUrl);
      pendingDeepLinkUrl = null;
    }
  } else {
    // On Windows/Linux, the URL comes via command line arguments
    const deepLinkUrl = process.argv.find((arg) => arg.startsWith("array://"));
    if (deepLinkUrl) {
      deepLinkService.handleUrl(deepLinkUrl);
    }
  }
});

app.on("window-all-closed", async () => {
  if (process.platform !== "darwin") {
    trackAppEvent(ANALYTICS_EVENTS.APP_QUIT);
    await shutdownPostHog();
    app.quit();
  }
});

app.on("before-quit", async (event) => {
  event.preventDefault();
  const agentService = container.get<AgentService>(MAIN_TOKENS.AgentService);
  await agentService.cleanupAll();
  trackAppEvent(ANALYTICS_EVENTS.APP_QUIT);
  await shutdownPostHog();
  app.exit(0);
});

app.on("activate", () => {
  if (mainWindow === null) {
    createWindow();
  }
});
