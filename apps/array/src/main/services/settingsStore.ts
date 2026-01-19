import { existsSync, renameSync } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { app } from "electron";
import Store from "electron-store";

interface SettingsSchema {
  worktreeLocation: string;
}

const LEGACY_DIR_NAME = ".array";
const CURRENT_DIR_NAME = ".twig";

function getDefaultWorktreeLocation(): string {
  return path.join(os.homedir(), CURRENT_DIR_NAME);
}

function getLegacyWorktreeLocation(): string {
  return path.join(os.homedir(), LEGACY_DIR_NAME);
}

/**
 * Migrate ~/.array to ~/.twig if needed (one-time migration)
 */
function migrateWorktreeDirectory(): void {
  const legacyPath = getLegacyWorktreeLocation();
  const newPath = getDefaultWorktreeLocation();

  // Only migrate if legacy exists and new doesn't
  if (existsSync(legacyPath) && !existsSync(newPath)) {
    try {
      renameSync(legacyPath, newPath);
    } catch {
      // If rename fails (e.g., cross-device), leave as-is
      // User can manually migrate or continue using legacy location
    }
  }
}

// Run migration before store initialization
migrateWorktreeDirectory();

const schema = {
  worktreeLocation: {
    type: "string" as const,
    default: getDefaultWorktreeLocation(),
  },
};

export const settingsStore = new Store<SettingsSchema>({
  name: "settings",
  schema,
  cwd: app.getPath("userData"),
  defaults: {
    worktreeLocation: getDefaultWorktreeLocation(),
  },
});

/**
 * Migrate stored worktree setting from ~/.array to ~/.twig if it was the default
 */
function migrateWorktreeSetting(): void {
  const stored = settingsStore.get("worktreeLocation");
  const legacyDefault = getLegacyWorktreeLocation();
  const newDefault = getDefaultWorktreeLocation();

  // If user had the legacy default, update to new default
  if (stored === legacyDefault && existsSync(newDefault)) {
    settingsStore.set("worktreeLocation", newDefault);
  }
}

// Run setting migration after store initialization
migrateWorktreeSetting();

export function getWorktreeLocation(): string {
  return settingsStore.get("worktreeLocation", getDefaultWorktreeLocation());
}

export function setWorktreeLocation(location: string): void {
  settingsStore.set("worktreeLocation", location);
}
