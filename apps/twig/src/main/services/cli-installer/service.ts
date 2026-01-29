import { exec } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { app } from "electron";
import { injectable } from "inversify";
import { logger } from "../../lib/logger.js";
import { TypedEventEmitter } from "../../lib/typed-event-emitter.js";
import { getMainWindow } from "../../trpc/context.js";

const fsPromises = fs.promises;
const execAsync = promisify(exec);
const log = logger.scope("cli-installer-service");

const CLI_INSTALL_PATH = "/usr/local/bin/twig";
const CLI_INSTALL_DIR = "/usr/local/bin";

export const CliInstallerEvent = {
  OpenPath: "openPath",
} as const;

export interface CliInstallerEvents {
  [CliInstallerEvent.OpenPath]: { path: string };
}

export interface PendingCliPath {
  path: string;
}

/**
 * Generates the shell script content for the twig CLI command.
 * The script opens the Twig app, optionally with a path argument.
 */
function generateCliScript(appPath: string): string {
  return `#!/bin/bash
# Twig CLI - Launch the Twig desktop application
# Installed by Twig app

APP_PATH="${appPath}"

if [ ! -d "$APP_PATH" ]; then
  echo "Error: Twig app not found at $APP_PATH"
  echo "Please reinstall the CLI from Twig settings."
  exit 1
fi

if [ $# -eq 0 ]; then
  # No arguments - just open the app
  open "$APP_PATH"
else
  # Path argument provided - resolve to absolute path and pass to app
  TARGET_PATH="$1"
  
  # Convert to absolute path if relative
  if [[ "$TARGET_PATH" != /* ]]; then
    TARGET_PATH="$(cd "$(dirname "$TARGET_PATH")" 2>/dev/null && pwd)/$(basename "$TARGET_PATH")"
  fi
  
  # Resolve symlinks and normalize the path
  if [ -e "$TARGET_PATH" ]; then
    TARGET_PATH="$(cd "$TARGET_PATH" 2>/dev/null && pwd)" || TARGET_PATH="$1"
  fi
  
  open "$APP_PATH" --args --open-path "$TARGET_PATH"
fi
`;
}

@injectable()
export class CliInstallerService extends TypedEventEmitter<CliInstallerEvents> {
  /**
   * Pending path that was received via CLI before renderer was ready.
   */
  private pendingPath: PendingCliPath | null = null;

  /**
   * Check if the CLI is currently installed
   */
  async isInstalled(): Promise<boolean> {
    try {
      await fsPromises.access(CLI_INSTALL_PATH, fs.constants.F_OK);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get the path to the current app bundle
   */
  private getAppPath(): string {
    if (app.isPackaged) {
      // In packaged app, get the .app bundle path
      // app.getPath('exe') returns something like /Applications/Twig.app/Contents/MacOS/Twig
      const exePath = app.getPath("exe");
      // Navigate up to the .app bundle
      return path.resolve(exePath, "..", "..", "..");
    }
    // In development, we can't really install a working CLI
    // Return a placeholder that will show an error
    return "/Applications/Twig.app";
  }

  /**
   * Check if we can write to the CLI install directory
   */
  private async canWriteToInstallDir(): Promise<boolean> {
    try {
      await fsPromises.access(CLI_INSTALL_DIR, fs.constants.W_OK);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Install the CLI using elevated privileges via osascript
   */
  private async installWithSudo(
    scriptContent: string,
  ): Promise<{ success: boolean; error?: string }> {
    try {
      // Write script to a temp file first
      const tempFile = path.join(os.tmpdir(), `twig-cli-${Date.now()}.sh`);
      await fsPromises.writeFile(tempFile, scriptContent, { mode: 0o755 });

      // Use osascript to run with admin privileges
      // This will prompt the user for their password via the system dialog
      const script = `
        do shell script "mkdir -p '${CLI_INSTALL_DIR}' && cp '${tempFile}' '${CLI_INSTALL_PATH}' && chmod 755 '${CLI_INSTALL_PATH}'" with administrator privileges
      `;

      await execAsync(`osascript -e '${script}'`);

      // Clean up temp file
      await fsPromises.unlink(tempFile).catch(() => {});

      log.info(`CLI installed to ${CLI_INSTALL_PATH} (with sudo)`);
      return { success: true };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unknown error occurred";
      log.error("Failed to install CLI with sudo:", error);

      // User cancelled the password prompt
      if (message.includes("User canceled") || message.includes("-128")) {
        return {
          success: false,
          error:
            "Installation cancelled. Administrator privileges are required to install the CLI.",
        };
      }

      return { success: false, error: message };
    }
  }

  /**
   * Install the CLI command to /usr/local/bin/twig
   */
  async install(): Promise<{ success: boolean; error?: string }> {
    try {
      const appPath = this.getAppPath();
      const scriptContent = generateCliScript(appPath);

      // Check if we can write directly
      if (await this.canWriteToInstallDir()) {
        // Direct install without sudo
        await fsPromises.writeFile(CLI_INSTALL_PATH, scriptContent, {
          mode: 0o755, // rwxr-xr-x
        });
        log.info(`CLI installed to ${CLI_INSTALL_PATH}`);
        return { success: true };
      }

      // Need elevated privileges - use osascript to prompt for password
      log.info("Requesting admin privileges to install CLI...");
      return await this.installWithSudo(scriptContent);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unknown error occurred";
      log.error("Failed to install CLI:", error);
      return { success: false, error: message };
    }
  }

  /**
   * Uninstall the CLI using elevated privileges via osascript
   */
  private async uninstallWithSudo(): Promise<{
    success: boolean;
    error?: string;
  }> {
    try {
      const script = `
        do shell script "rm -f '${CLI_INSTALL_PATH}'" with administrator privileges
      `;

      await execAsync(`osascript -e '${script}'`);

      log.info(`CLI uninstalled from ${CLI_INSTALL_PATH} (with sudo)`);
      return { success: true };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unknown error occurred";
      log.error("Failed to uninstall CLI with sudo:", error);

      // User cancelled the password prompt
      if (message.includes("User canceled") || message.includes("-128")) {
        return {
          success: false,
          error:
            "Uninstall cancelled. Administrator privileges are required to remove the CLI.",
        };
      }

      return { success: false, error: message };
    }
  }

  /**
   * Uninstall the CLI command
   */
  async uninstall(): Promise<{ success: boolean; error?: string }> {
    // Check if file exists first
    const installed = await this.isInstalled();
    if (!installed) {
      return { success: true };
    }

    try {
      await fsPromises.unlink(CLI_INSTALL_PATH);
      log.info(`CLI uninstalled from ${CLI_INSTALL_PATH}`);
      return { success: true };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unknown error occurred";

      if (message.includes("ENOENT")) {
        // File doesn't exist, consider it a success
        return { success: true };
      }

      // Permission denied - try with sudo
      if (message.includes("EACCES") || message.includes("permission")) {
        log.info("Requesting admin privileges to uninstall CLI...");
        return await this.uninstallWithSudo();
      }

      log.error("Failed to uninstall CLI:", error);
      return { success: false, error: message };
    }
  }

  /**
   * Handle a path argument received from the CLI
   */
  handleOpenPath(targetPath: string): void {
    log.info("Received open-path from CLI:", targetPath);

    // Resolve home directory if needed
    let resolvedPath = targetPath;
    if (resolvedPath.startsWith("~")) {
      resolvedPath = resolvedPath.replace(/^~/, os.homedir());
    }

    // Check if renderer is ready (has any listeners)
    const hasListeners = this.listenerCount(CliInstallerEvent.OpenPath) > 0;

    if (hasListeners) {
      log.info(`Emitting open-path event: ${resolvedPath}`);
      this.emit(CliInstallerEvent.OpenPath, { path: resolvedPath });
    } else {
      // Renderer not ready yet - queue it for later
      log.info(`Queueing open-path (renderer not ready): ${resolvedPath}`);
      this.pendingPath = { path: resolvedPath };
    }

    // Focus the window
    const mainWindow = getMainWindow();
    if (mainWindow) {
      if (mainWindow.isMinimized()) {
        mainWindow.restore();
      }
      mainWindow.focus();
    }
  }

  /**
   * Get and clear any pending path.
   * Called by renderer on mount to handle paths that arrived before it was ready.
   */
  consumePendingPath(): PendingCliPath | null {
    const pending = this.pendingPath;
    this.pendingPath = null;
    if (pending) {
      log.info(`Consumed pending path: ${pending.path}`);
    }
    return pending;
  }
}
