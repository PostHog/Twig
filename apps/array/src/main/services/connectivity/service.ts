import { net } from "electron";
import { injectable, postConstruct } from "inversify";
import { logger } from "../../lib/logger.js";
import { TypedEventEmitter } from "../../lib/typed-event-emitter.js";
import {
  ConnectivityEvent,
  type ConnectivityEvents,
  type ConnectivityStatusOutput,
} from "./schemas.js";

const log = logger.scope("connectivity");

const CHECK_URL = "https://www.google.com/generate_204";
const MIN_POLL_INTERVAL_MS = 3_000;
const MAX_POLL_INTERVAL_MS = 10_000;
const ONLINE_POLL_INTERVAL_MS = 3_000;

@injectable()
export class ConnectivityService extends TypedEventEmitter<ConnectivityEvents> {
  private isOnline = false;
  private pollTimeoutId: ReturnType<typeof setTimeout> | null = null;
  private currentPollInterval = MIN_POLL_INTERVAL_MS;

  @postConstruct()
  init(): void {
    this.isOnline = net.isOnline();
    log.info("Initial connectivity status", { isOnline: this.isOnline });

    this.startPolling();
  }

  getStatus(): ConnectivityStatusOutput {
    return { isOnline: this.isOnline };
  }

  async checkNow(): Promise<ConnectivityStatusOutput> {
    await this.checkConnectivity();
    return { isOnline: this.isOnline };
  }

  private setOnline(online: boolean): void {
    if (this.isOnline === online) return;

    this.isOnline = online;
    log.info("Connectivity status changed", { isOnline: online });
    this.emit(ConnectivityEvent.StatusChange, { isOnline: online });

    this.currentPollInterval = MIN_POLL_INTERVAL_MS;
  }

  private async checkConnectivity(): Promise<void> {
    if (!net.isOnline()) {
      this.setOnline(false);
      return;
    }

    if (!this.isOnline) {
      const verified = await this.verifyWithHttp();
      this.setOnline(verified);
    }
  }

  private async verifyWithHttp(): Promise<boolean> {
    try {
      const response = await net.fetch(CHECK_URL, { method: "HEAD" });
      return response.ok || response.status === 204;
    } catch (error) {
      log.debug("HTTP connectivity check failed", { error });
      return false;
    }
  }

  private startPolling(): void {
    if (this.pollTimeoutId) return;

    this.currentPollInterval = MIN_POLL_INTERVAL_MS;
    this.schedulePoll();
  }

  private schedulePoll(): void {
    // when online: just poll net.isOnline periodically
    // when offline: poll more frequently with backoff to detect recovery
    const interval = this.isOnline
      ? ONLINE_POLL_INTERVAL_MS
      : this.currentPollInterval;

    this.pollTimeoutId = setTimeout(async () => {
      this.pollTimeoutId = null;

      const wasOffline = !this.isOnline;
      await this.checkConnectivity();

      if (!this.isOnline && wasOffline) {
        this.currentPollInterval = Math.min(
          this.currentPollInterval * 1.5,
          MAX_POLL_INTERVAL_MS,
        );
      }

      this.schedulePoll();
    }, interval);
  }
}
