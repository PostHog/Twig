import { exec } from "node:child_process";
import fs from "node:fs/promises";
import { promisify } from "node:util";
import type { DetectedApplication, ExternalAppType } from "@shared/types.js";
import { app, clipboard } from "electron";
import Store from "electron-store";
import { injectable } from "inversify";
import type { AppDefinition, ExternalAppsSchema } from "./types.js";

const execAsync = promisify(exec);

@injectable()
export class ExternalAppsService {
  private readonly APP_DEFINITIONS: Record<string, AppDefinition> = {
    vscode: { path: "/Applications/Visual Studio Code.app", type: "editor" },
    cursor: { path: "/Applications/Cursor.app", type: "editor" },
    windsurf: { path: "/Applications/Windsurf.app", type: "editor" },
    zed: { path: "/Applications/Zed.app", type: "editor" },
    sublime: { path: "/Applications/Sublime Text.app", type: "editor" },
    nova: { path: "/Applications/Nova.app", type: "editor" },
    bbedit: { path: "/Applications/BBEdit.app", type: "editor" },
    textmate: { path: "/Applications/TextMate.app", type: "editor" },
    lapce: { path: "/Applications/Lapce.app", type: "editor" },
    emacs: { path: "/Applications/Emacs.app", type: "editor" },
    xcode: { path: "/Applications/Xcode.app", type: "editor" },
    androidstudio: {
      path: "/Applications/Android Studio.app",
      type: "editor",
    },
    fleet: { path: "/Applications/Fleet.app", type: "editor" },
    intellij: { path: "/Applications/IntelliJ IDEA.app", type: "editor" },
    intellijce: { path: "/Applications/IntelliJ IDEA CE.app", type: "editor" },
    intellijultimate: {
      path: "/Applications/IntelliJ IDEA Ultimate.app",
      type: "editor",
    },
    webstorm: { path: "/Applications/WebStorm.app", type: "editor" },
    pycharm: { path: "/Applications/PyCharm.app", type: "editor" },
    pycharmce: { path: "/Applications/PyCharm CE.app", type: "editor" },
    pycharmpro: {
      path: "/Applications/PyCharm Professional Edition.app",
      type: "editor",
    },
    phpstorm: { path: "/Applications/PhpStorm.app", type: "editor" },
    rubymine: { path: "/Applications/RubyMine.app", type: "editor" },
    goland: { path: "/Applications/GoLand.app", type: "editor" },
    clion: { path: "/Applications/CLion.app", type: "editor" },
    rider: { path: "/Applications/Rider.app", type: "editor" },
    datagrip: { path: "/Applications/DataGrip.app", type: "editor" },
    dataspell: { path: "/Applications/DataSpell.app", type: "editor" },
    rustrover: { path: "/Applications/RustRover.app", type: "editor" },
    aqua: { path: "/Applications/Aqua.app", type: "editor" },
    writerside: { path: "/Applications/Writerside.app", type: "editor" },
    appcode: { path: "/Applications/AppCode.app", type: "editor" },
    eclipse: { path: "/Applications/Eclipse.app", type: "editor" },
    netbeans: { path: "/Applications/NetBeans.app", type: "editor" },
    netbeansapache: {
      path: "/Applications/Apache NetBeans.app",
      type: "editor",
    },
    iterm: { path: "/Applications/iTerm.app", type: "terminal" },
    warp: { path: "/Applications/Warp.app", type: "terminal" },
    terminal: {
      path: "/System/Applications/Utilities/Terminal.app",
      type: "terminal",
    },
    alacritty: { path: "/Applications/Alacritty.app", type: "terminal" },
    kitty: { path: "/Applications/kitty.app", type: "terminal" },
    ghostty: { path: "/Applications/Ghostty.app", type: "terminal" },
    hyper: { path: "/Applications/Hyper.app", type: "terminal" },
    tabby: { path: "/Applications/Tabby.app", type: "terminal" },
    rio: { path: "/Applications/Rio.app", type: "terminal" },
    finder: {
      path: "/System/Library/CoreServices/Finder.app",
      type: "file-manager",
    },
  };

  private readonly DISPLAY_NAMES: Record<string, string> = {
    vscode: "VS Code",
    cursor: "Cursor",
    windsurf: "Windsurf",
    zed: "Zed",
    sublime: "Sublime Text",
    nova: "Nova",
    bbedit: "BBEdit",
    textmate: "TextMate",
    lapce: "Lapce",
    emacs: "Emacs",
    xcode: "Xcode",
    androidstudio: "Android Studio",
    fleet: "Fleet",
    intellij: "IntelliJ IDEA",
    intellijce: "IntelliJ IDEA CE",
    intellijultimate: "IntelliJ IDEA Ultimate",
    webstorm: "WebStorm",
    pycharm: "PyCharm",
    pycharmce: "PyCharm CE",
    pycharmpro: "PyCharm Professional",
    phpstorm: "PhpStorm",
    rubymine: "RubyMine",
    goland: "GoLand",
    clion: "CLion",
    rider: "Rider",
    datagrip: "DataGrip",
    dataspell: "DataSpell",
    rustrover: "RustRover",
    aqua: "Aqua",
    writerside: "Writerside",
    appcode: "AppCode",
    eclipse: "Eclipse",
    netbeans: "NetBeans",
    netbeansapache: "Apache NetBeans",
    iterm: "iTerm",
    warp: "Warp",
    terminal: "Terminal",
    alacritty: "Alacritty",
    kitty: "Kitty",
    ghostty: "Ghostty",
    hyper: "Hyper",
    tabby: "Tabby",
    rio: "Rio",
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
