import { exec } from "node:child_process";
import fs from "node:fs/promises";
import { promisify } from "node:util";
import { app, clipboard } from "electron";
import Store from "electron-store";
import { injectable } from "inversify";
import type {
  DetectedApplication,
  ExternalAppType,
} from "../../../shared/types.js";
import type { AppDefinition, ExternalAppsSchema } from "./types.js";

const execAsync = promisify(exec);

@injectable()
export class ExternalAppsService {
  private readonly APP_DEFINITIONS: Record<string, AppDefinition> = {
    vscode: { path: "/Applications/Visual Studio Code.app", type: "editor" },
    cursor: { path: "/Applications/Cursor.app", type: "editor" },
    sublime: { path: "/Applications/Sublime Text.app", type: "editor" },
    webstorm: { path: "/Applications/WebStorm.app", type: "editor" },
    intellij: { path: "/Applications/IntelliJ IDEA.app", type: "editor" },
    zed: { path: "/Applications/Zed.app", type: "editor" },
    pycharm: { path: "/Applications/PyCharm.app", type: "editor" },
    iterm: { path: "/Applications/iTerm.app", type: "terminal" },
    warp: { path: "/Applications/Warp.app", type: "terminal" },
    terminal: {
      path: "/System/Applications/Utilities/Terminal.app",
      type: "terminal",
    },
    alacritty: { path: "/Applications/Alacritty.app", type: "terminal" },
    kitty: { path: "/Applications/kitty.app", type: "terminal" },
    ghostty: { path: "/Applications/Ghostty.app", type: "terminal" },
    finder: {
      path: "/System/Library/CoreServices/Finder.app",
      type: "file-manager",
    },
  };

  private readonly DISPLAY_NAMES: Record<string, string> = {
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

  private fileIconModule: typeof import("file-icon") | null = null;
  private cachedApps: DetectedApplication[] | null = null;
  private detectionPromise: Promise<DetectedApplication[]> | null = null;
  private prefsStore: Store<ExternalAppsSchema>;

  constructor() {
    this.prefsStore = new Store<ExternalAppsSchema>({
      name: "external-apps",
      cwd: app.getPath("userData"),
      defaults: {
        externalAppsPrefs: {},
      },
    });
  }

  private async getFileIcon() {
    if (!this.fileIconModule) {
      this.fileIconModule = await import("file-icon");
    }
    return this.fileIconModule;
  }

  private async extractIcon(appPath: string): Promise<string | undefined> {
    try {
      const fileIconModule = await this.getFileIcon();
      const uint8Array = await fileIconModule.fileIconToBuffer(appPath, {
        size: 64,
      });
      const buffer = Buffer.from(uint8Array);
      const base64 = buffer.toString("base64");
      return `data:image/png;base64,${base64}`;
    } catch {
      return undefined;
    }
  }

  private async checkApplication(
    id: string,
    appPath: string,
    type: ExternalAppType,
  ): Promise<DetectedApplication | null> {
    try {
      await fs.access(appPath);
      const icon = await this.extractIcon(appPath);
      const name = this.DISPLAY_NAMES[id] || id;
      return {
        id,
        name,
        type,
        path: appPath,
        command: `open -a "${appPath}"`,
        icon,
      };
    } catch {
      return null;
    }
  }

  private async detectExternalApps(): Promise<DetectedApplication[]> {
    const apps: DetectedApplication[] = [];
    for (const [id, definition] of Object.entries(this.APP_DEFINITIONS)) {
      const detected = await this.checkApplication(
        id,
        definition.path,
        definition.type,
      );
      if (detected) {
        apps.push(detected);
      }
    }
    return apps;
  }

  async getDetectedApps(): Promise<DetectedApplication[]> {
    if (this.cachedApps) {
      return this.cachedApps;
    }

    if (this.detectionPromise) {
      return this.detectionPromise;
    }

    this.detectionPromise = this.detectExternalApps().then((apps) => {
      this.cachedApps = apps;
      this.detectionPromise = null;
      return apps;
    });

    return this.detectionPromise;
  }

  async openInApp(
    appId: string,
    targetPath: string,
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const apps = await this.getDetectedApps();
      const appToOpen = apps.find((a) => a.id === appId);

      if (!appToOpen) {
        return { success: false, error: "Application not found" };
      }

      let isFile = false;
      try {
        const stat = await fs.stat(targetPath);
        isFile = stat.isFile();
      } catch {
        isFile = false;
      }

      const command =
        appToOpen.id === "finder" && isFile
          ? `open -R "${targetPath}"`
          : `open -a "${appToOpen.path}" "${targetPath}"`;

      await execAsync(command);
      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  async setLastUsed(appId: string): Promise<void> {
    const prefs = this.prefsStore.get("externalAppsPrefs");
    this.prefsStore.set("externalAppsPrefs", { ...prefs, lastUsedApp: appId });
  }

  async getLastUsed(): Promise<{ lastUsedApp?: string }> {
    const prefs = this.prefsStore.get("externalAppsPrefs");
    return { lastUsedApp: prefs.lastUsedApp };
  }

  async copyPath(targetPath: string): Promise<void> {
    clipboard.writeText(targetPath);
  }

  getPrefsStore() {
    return this.prefsStore;
  }
}
