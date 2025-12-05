import dns from "node:dns";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  app,
  BrowserWindow,
  ipcMain,
  Menu,
  type MenuItemConstructorOptions,
  shell,
} from "electron";

// DEBUG: Log all ARRAY_* env vars at startup
console.log("[DEBUG] Main process env vars:");
for (const [key, value] of Object.entries(process.env)) {
  if (key.startsWith("ARRAY_")) {
    console.log(`  ${key}=${value}`);
  }
}

import "./lib/logger";
import { ANALYTICS_EVENTS } from "../types/analytics.js";
import {
  cleanupAgentSessions,
  registerAgentIpc,
} from "./services/session-manager.js";

// Legacy type kept for backwards compatibility with taskControllers map
type TaskController = unknown;

import { shellManager } from "./lib/shellManager.js";
import { registerFileWatcherIpc } from "./services/fileWatcher.js";
import { registerFoldersIpc } from "./services/folders.js";
import { registerFsIpc } from "./services/fs.js";
import { registerGitIpc } from "./services/git.js";
import "./services/index.js";
import {
  getOrRefreshApps,
  registerExternalAppsIpc,
} from "./services/externalApps.js";
import { registerOAuthHandlers } from "./services/oauth.js";
import { registerOsIpc } from "./services/os.js";
import { registerPosthogIpc } from "./services/posthog.js";
import {
  initializePostHog,
  shutdownPostHog,
  trackAppEvent,
} from "./services/posthog-analytics.js";
import { registerSettingsIpc } from "./services/settings.js";
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

// Set app name based on workspace (for unique userData paths per workspace)
const workspaceName = process.env.ARRAY_WORKSPACE_NAME;
const appName = workspaceName ? `Array (${workspaceName})` : "Array";
app.setName(appName);

// Use workspace-specific data directory if provided
if (process.env.ARRAY_WORKSPACE_DATA_DIR) {
  app.setPath("userData", process.env.ARRAY_WORKSPACE_DATA_DIR);
}

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
  const windowTitle = workspaceName ? `Array (${workspaceName})` : "Array";

  mainWindow = new BrowserWindow({
    width: 900,
    height: 600,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: "#0a0a0a",
    titleBarStyle: "hiddenInset",
    title: windowTitle,
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

  setupExternalLinkHandlers(mainWindow);

  // Kill all shell sessions when renderer reloads (dev hot reload or CMD R)
  mainWindow.webContents.on("did-start-loading", () => {
    if (mainWindow?.webContents) {
      shellManager.destroyByWebContents(mainWindow.webContents);
    }
  });

  // Set up menu for keyboard shortcuts
  const template: MenuItemConstructorOptions[] = [
    {
      label: "Array",
      submenu: [
        { role: "about" },
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

  // Initialize PostHog analytics
  initializePostHog();
  trackAppEvent(ANALYTICS_EVENTS.APP_STARTED);

  // Preload external app icons in background
  getOrRefreshApps().catch(() => {
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
ipcMain.handle(
  "app:get-workspace-name",
  () => process.env.ARRAY_WORKSPACE_NAME || null,
);

// Register IPC handlers via services
registerPosthogIpc();
registerOAuthHandlers();
registerOsIpc(() => mainWindow);
registerGitIpc(() => mainWindow);
registerAgentIpc(taskControllers, () => mainWindow);
registerFsIpc();
registerFileWatcherIpc(() => mainWindow);
registerFoldersIpc(() => mainWindow);
registerWorktreeIpc();
registerShellIpc();
registerExternalAppsIpc();
registerWorkspaceIpc(() => mainWindow);
registerSettingsIpc();
