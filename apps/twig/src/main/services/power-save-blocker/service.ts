import { powerSaveBlocker } from "electron";
import { injectable, preDestroy } from "inversify";
import { logger } from "../../lib/logger.js";
import { settingsStore } from "../settingsStore.js";

const log = logger.scope("power-save-blocker");

@injectable()
export class PowerSaveBlockerService {
  private enabled: boolean;
  private blockerId: number | null = null;
  private activeActivities = new Set<string>();

  constructor() {
    this.enabled = settingsStore.get("preventSleepWhileRunning", false);
  }

  setEnabled(enabled: boolean): void {
    log.info("setEnabled", { enabled });
    this.enabled = enabled;
    settingsStore.set("preventSleepWhileRunning", enabled);
    this.updateBlocker();
  }

  getEnabled(): boolean {
    return this.enabled;
  }

  acquire(activityId: string): void {
    this.activeActivities.add(activityId);
    this.updateBlocker();
  }

  release(activityId: string): void {
    this.activeActivities.delete(activityId);
    this.updateBlocker();
  }

  @preDestroy()
  cleanup(): void {
    this.stopBlocker();
  }

  private updateBlocker(): void {
    if (this.enabled && this.activeActivities.size > 0) {
      this.startBlocker();
    } else {
      this.stopBlocker();
    }
  }

  private startBlocker(): void {
    if (this.blockerId !== null) return;
    this.blockerId = powerSaveBlocker.start("prevent-app-suspension");
    log.info("Started power save blocker", { blockerId: this.blockerId });
  }

  private stopBlocker(): void {
    if (this.blockerId === null) return;
    log.info("Stopping power save blocker", { blockerId: this.blockerId });
    powerSaveBlocker.stop(this.blockerId);
    this.blockerId = null;
  }
}
