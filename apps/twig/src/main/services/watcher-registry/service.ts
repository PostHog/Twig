import type * as watcher from "@parcel/watcher";
import { injectable } from "inversify";
import { logger } from "../../lib/logger.js";

const log = logger.scope("watcher-registry");

const UNSUBSCRIBE_TIMEOUT_MS = 2000;

@injectable()
export class WatcherRegistryService {
  private subscriptions = new Map<string, watcher.AsyncSubscription>();
  private _isShutdown = false;

  get isShutdown(): boolean {
    return this._isShutdown;
  }

  register(id: string, subscription: watcher.AsyncSubscription): void {
    if (this._isShutdown) {
      log.warn(`Attempted to register watcher after shutdown: ${id}`);
      subscription.unsubscribe().catch((err) => {
        log.warn(`Failed to unsubscribe rejected watcher ${id}:`, err);
      });
      return;
    }

    if (this.subscriptions.has(id)) {
      log.warn(`Replacing existing watcher: ${id}`);
      const existing = this.subscriptions.get(id)!;
      existing.unsubscribe().catch((err) => {
        log.warn(`Failed to unsubscribe replaced watcher ${id}:`, err);
      });
    }

    this.subscriptions.set(id, subscription);
    log.debug(`Registered watcher: ${id}`);
  }

  async unregister(id: string): Promise<void> {
    const subscription = this.subscriptions.get(id);
    if (!subscription) return;

    this.subscriptions.delete(id);
    try {
      await subscription.unsubscribe();
      log.debug(`Unregistered watcher: ${id}`);
    } catch (err) {
      log.warn(`Failed to unsubscribe watcher ${id}:`, err);
    }
  }

  async shutdownAll(): Promise<void> {
    if (this._isShutdown) {
      log.warn("shutdownAll called but already shutdown");
      return;
    }

    this._isShutdown = true;
    const count = this.subscriptions.size;

    if (count === 0) {
      log.info("No watchers to shutdown");
      return;
    }

    log.info(`Shutting down ${count} watchers`);

    const entries = Array.from(this.subscriptions.entries());
    this.subscriptions.clear();

    const results = await Promise.allSettled(
      entries.map(([id, sub]) => this.unsubscribeWithTimeout(id, sub)),
    );

    const failures = results.filter((r) => r.status === "rejected").length;
    const timeouts = results.filter(
      (r) => r.status === "fulfilled" && r.value === "timeout",
    ).length;

    if (failures > 0 || timeouts > 0) {
      log.warn(
        `Watcher shutdown: ${count - failures - timeouts} clean, ${timeouts} timed out, ${failures} failed`,
      );
    } else {
      log.info(`All ${count} watchers shutdown successfully`);
    }
  }

  private async unsubscribeWithTimeout(
    id: string,
    sub: watcher.AsyncSubscription,
  ): Promise<"ok" | "timeout"> {
    const timeoutPromise = new Promise<"timeout">((resolve) =>
      setTimeout(() => resolve("timeout"), UNSUBSCRIBE_TIMEOUT_MS),
    );

    const unsubPromise = sub
      .unsubscribe()
      .then(() => "ok" as const)
      .catch((err) => {
        log.warn(`Failed to unsubscribe watcher ${id}:`, err);
        return "ok" as const;
      });

    const result = await Promise.race([unsubPromise, timeoutPromise]);

    if (result === "timeout") {
      log.warn(
        `Watcher ${id} unsubscribe timed out after ${UNSUBSCRIBE_TIMEOUT_MS}ms`,
      );
    } else {
      log.debug(`Shutdown watcher: ${id}`);
    }

    return result;
  }
}
