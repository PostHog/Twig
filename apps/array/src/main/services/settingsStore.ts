import * as os from "node:os";
import * as path from "node:path";
import { app } from "electron";
import Store from "electron-store";

interface SettingsSchema {
  worktreeLocation: string;
}

function getDefaultWorktreeLocation(): string {
  return path.join(os.homedir(), ".array");
}

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

export function getWorktreeLocation(): string {
  return settingsStore.get("worktreeLocation", getDefaultWorktreeLocation());
}

export function setWorktreeLocation(location: string): void {
  settingsStore.set("worktreeLocation", location);
}
