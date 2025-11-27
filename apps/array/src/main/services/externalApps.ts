import { exec } from "node:child_process";
import fs from "node:fs/promises";
import { promisify } from "node:util";
import { app, ipcMain } from "electron";
import Store from "electron-store";
import type {
  DetectedApplication,
  ExternalAppsPreferences,
  ExternalAppType,
} from "../../shared/types";

const execAsync = promisify(exec);

// Dynamic import for file-icon ESM module
let fileIcon: typeof import("file-icon") | null = null;
async function getFileIcon() {
  if (!fileIcon) {
    fileIcon = await import("file-icon");
  }
  return fileIcon;
}

// Cache detected apps in memory (cache the promise to prevent concurrent detections)
let cachedApps: DetectedApplication[] | null = null;
let detectionPromise: Promise<DetectedApplication[]> | null = null;

const APP_PATHS: Record<string, string> = {
  vscode: "/Applications/Visual Studio Code.app",
  cursor: "/Applications/Cursor.app",
  sublime: "/Applications/Sublime Text.app",
  webstorm: "/Applications/WebStorm.app",
  intellij: "/Applications/IntelliJ IDEA.app",
  zed: "/Applications/Zed.app",
  pycharm: "/Applications/PyCharm.app",
  iterm: "/Applications/iTerm.app",
  warp: "/Applications/Warp.app",
  terminal: "/System/Applications/Utilities/Terminal.app",
  alacritty: "/Applications/Alacritty.app",
  kitty: "/Applications/kitty.app",
  ghostty: "/Applications/Ghostty.app",
  finder: "/System/Library/CoreServices/Finder.app",
};

const DISPLAY_NAMES: Record<string, string> = {
  vscode: "VS Code",
  cursor: "Cursor",
  sublime: "Sublime Text",
  webstorm: "WebStorm",
  intellij: "IntelliJ IDEA",
  zed: "Zed",
  pycharm: "PyCharm",
  iterm: "iTerm",
  warp: "Warp",
  terminal: "Terminal",
  alacritty: "Alacritty",
  kitty: "Kitty",
  ghostty: "Ghostty",
  finder: "Finder",
};

function getStorePath(): string {
  const userDataPath = app.getPath("userData");
  if (userDataPath.includes("@posthog")) {
    const path = require("node:path");
    return path.join(path.dirname(userDataPath), "Array");
  }
  return userDataPath;
}

interface ExternalAppsSchema {
  externalAppsPrefs: ExternalAppsPreferences;
}

export const externalAppsStore = new Store<ExternalAppsSchema>({
  name: "external-apps",
  cwd: getStorePath(),
  defaults: {
    externalAppsPrefs: {},
  },
});

async function extractIcon(appPath: string): Promise<string | undefined> {
  try {
    const fileIconModule = await getFileIcon();
    const uint8Array = await fileIconModule.fileIconToBuffer(appPath, {
      size: 64,
    });
    const buffer = Buffer.from(uint8Array);
    const base64 = buffer.toString("base64");
    return `data:image/png;base64,${base64}`;
  } catch (_error) {
    return undefined;
  }
}

function generateCommand(appPath: string): string {
  return `open -a "${appPath}"`;
}

function getDisplayName(id: string): string {
  return DISPLAY_NAMES[id] || id;
}

async function checkApplication(
  id: string,
  appPath: string,
  type: ExternalAppType,
): Promise<DetectedApplication | null> {
  try {
    await fs.access(appPath);

    const icon = await extractIcon(appPath);
    const command = generateCommand(appPath);
    const name = getDisplayName(id);

    return {
      id,
      name,
      type,
      path: appPath,
      command,
      icon,
    };
  } catch {
    return null;
  }
}

async function detectExternalApps(): Promise<DetectedApplication[]> {
  const apps: DetectedApplication[] = [];

  for (const [id, appPath] of Object.entries(APP_PATHS)) {
    const detected = await checkApplication(id, appPath, "editor");
    if (detected) {
      apps.push(detected);
    }
  }

  return apps;
}

export async function getOrRefreshApps(): Promise<DetectedApplication[]> {
  if (cachedApps) {
    return cachedApps;
  }

  if (detectionPromise) {
    return detectionPromise;
  }

  detectionPromise = detectExternalApps().then((apps) => {
    cachedApps = apps;
    detectionPromise = null;
    return apps;
  });

  return detectionPromise;
}

export function registerExternalAppsIpc(): void {
  ipcMain.handle(
    "external-apps:get-detected-apps",
    async (): Promise<DetectedApplication[]> => {
      return await getOrRefreshApps();
    },
  );

  ipcMain.handle(
    "external-apps:open-in-app",
    async (
      _event,
      appId: string,
      targetPath: string,
    ): Promise<{ success: boolean; error?: string }> => {
      try {
        const apps = await getOrRefreshApps();
        const appToOpen = apps.find((a) => a.id === appId);

        if (!appToOpen) {
          return { success: false, error: "Application not found" };
        }

        let command: string;
        if (appToOpen.command.includes("open -a")) {
          command = `${appToOpen.command} "${targetPath}"`;
        } else {
          command = `${appToOpen.command} "${targetPath}"`;
        }

        await execAsync(command);
        return { success: true };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : "Unknown error",
        };
      }
    },
  );

  ipcMain.handle(
    "external-apps:set-last-used",
    async (_event, appId: string): Promise<void> => {
      const prefs = externalAppsStore.get("externalAppsPrefs");
      externalAppsStore.set("externalAppsPrefs", {
        ...prefs,
        lastUsedApp: appId,
      });
    },
  );

  ipcMain.handle(
    "external-apps:get-last-used",
    async (): Promise<{
      lastUsedApp?: string;
    }> => {
      const prefs = externalAppsStore.get("externalAppsPrefs");
      return {
        lastUsedApp: prefs.lastUsedApp,
      };
    },
  );

  ipcMain.handle(
    "external-apps:copy-path",
    async (_event, targetPath: string): Promise<void> => {
      const { clipboard } = await import("electron");
      clipboard.writeText(targetPath);
    },
  );
}
