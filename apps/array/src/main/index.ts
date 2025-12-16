declare const __BUILD_COMMIT__: string | undefined;
declare const __BUILD_DATE__: string | undefined;

import "reflect-metadata";
import dns from "node:dns";
import { mkdirSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  app,
  BrowserWindow,
  clipboard,
  dialog,
  ipcMain,
  Menu,
  type MenuItemConstructorOptions,
  shell,
} from "electron";
import { createIPCHandler } from "trpc-electron/main";
import "./lib/logger";
import { ANALYTICS_EVENTS } from "../types/analytics.js";
import { container } from "./di/container.js";
import { MAIN_TOKENS } from "./di/tokens.js";
import type { DockBadgeService } from "./services/dock-badge/service.js";
import {
  cleanupAgentSessions,
  registerAgentIpc,
} from "./services/session-manager.js";
import { setMainWindowGetter } from "./trpc/context.js";
import { trpcRouter } from "./trpc/index.js";

// Legacy type kept for backwards compatibility with taskControllers map
type TaskController = unknown;

import { registerFileWatcherIpc } from "./services/fileWatcher.js";
import { registerFoldersIpc } from "./services/folders.js";
import { registerGitIpc } from "./services/git.js";
import "./services/index.js";
import { ExternalAppsService } from "./services/external-apps/service.js";
import { registerOAuthHandlers } from "./services/oauth.js";
import {
  initializePostHog,
  shutdownPostHog,
  trackAppEvent,
} from "./services/posthog-analytics.js";
import { registerShellIpc } from "./services/shell.js";
import { registerAutoUpdater } from "./services/updates.js";
import { registerWorkspaceIpc } from "./services/workspace/index.js";
import { registerWorktreeIpc } from "./services/worktree.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

declare const MAIN_WINDOW_VITE_DEV_SERVER_URL: string | undefined;
declare const MAIN_WINDOW_VITE_NAME: string;

let mainWindow: BrowserWindow | null = null;
const taskControllers = new Map<string, TaskController>();

// Force IPv4 resolution when "localhost" is used so the agent hits 127.0.0.1
// instead of ::1. This matches how the renderer already reaches the PostHog API.
dns.setDefaultResultOrder("ipv4first");

// Set app name to ensure consistent userData path across platforms
app.setName("Array");

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
        {
          label: "Check for Updates...",
          click: () => {
            mainWindow?.webContents.send("check-for-updates-menu");
          },
        },
        { type: "separator" },
        {
          label: "Settings...",
          accelerator: "CmdOrCtrl+,",
          click: () => {
            mainWindow?.webContents.send("open-settings");
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
            mainWindow?.webContents.send("new-task");
          },
        },
        { type: "separator" },
        {
          label: "Developer",
          submenu: [
            {
              label: "Clear application storage",
              click: () => {
                mainWindow?.webContents.send("clear-storage");
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
            mainWindow?.webContents.send("reset-layout");
          },
        },
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

  // Initialize dock badge service for notification badges
  container.get<DockBadgeService>(MAIN_TOKENS.DockBadgeService);

  // Initialize PostHog analytics
  initializePostHog();
  trackAppEvent(ANALYTICS_EVENTS.APP_STARTED);

  // Preload external app icons in background
  new ExternalAppsService().getDetectedApps().catch(() => {
    // Silently fail, will retry on first use
  });
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
  await cleanupAgentSessions();
  trackAppEvent(ANALYTICS_EVENTS.APP_QUIT);
  await shutdownPostHog();
  app.exit(0);
});

app.on("activate", () => {
  if (mainWindow === null) {
    createWindow();
  }
});

// Background services
registerAutoUpdater(() => mainWindow);

ipcMain.handle("app:get-version", () => app.getVersion());

// Register IPC handlers via services
registerOAuthHandlers();
registerGitIpc();
registerAgentIpc(taskControllers, () => mainWindow);
registerFileWatcherIpc(() => mainWindow);
registerFoldersIpc(() => mainWindow);
registerWorktreeIpc();
registerShellIpc();
registerWorkspaceIpc(() => mainWindow);
