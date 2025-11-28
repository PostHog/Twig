import { createIpcHandler } from "../lib/ipcHandler";
import { logger } from "../lib/logger";
import { getWorktreeLocation, setWorktreeLocation } from "./settingsStore";

const log = logger.scope("settings");
const handle = createIpcHandler("settings");

export function registerSettingsIpc(): void {
  handle("settings:get-worktree-location", () => getWorktreeLocation());

  handle("settings:set-worktree-location", (_event, location: string) => {
    setWorktreeLocation(location);
    log.info(`Worktree location set to: ${location}`);
  });
}
