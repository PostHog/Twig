import { app } from "electron";
import { injectable } from "inversify";
import { logger } from "../../lib/logger.js";

const log = logger.scope("deep-link-service");

const PROTOCOL = "twig";
const LEGACY_PROTOCOL = "array";

export type DeepLinkHandler = (
  path: string,
  searchParams: URLSearchParams,
) => boolean;

@injectable()
export class DeepLinkService {
  private protocolRegistered = false;
  private handlers = new Map<string, DeepLinkHandler>();

  public registerProtocol(): void {
    if (this.protocolRegistered) {
      return;
    }

    // Skip protocol registration in development to avoid hijacking deep links
    // from the production app. OAuth uses HTTP callback in dev mode anyway.
    if (process.defaultApp) {
      log.info(
        "Skipping protocol registration in development (using HTTP callback for OAuth)",
      );
      return;
    }

    // Production: register both new and legacy protocols
    app.setAsDefaultProtocolClient(PROTOCOL);
    app.setAsDefaultProtocolClient(LEGACY_PROTOCOL);

    this.protocolRegistered = true;
    log.info(
      `Registered '${PROTOCOL}' and '${LEGACY_PROTOCOL}' protocol handlers`,
    );
  }

  public registerHandler(key: string, handler: DeepLinkHandler): void {
    if (this.handlers.has(key)) {
      log.warn(`Overwriting existing handler for key: ${key}`);
    }
    this.handlers.set(key, handler);
    log.info(`Registered deep link handler for key: ${key}`);
  }

  public unregisterHandler(key: string): void {
    this.handlers.delete(key);
  }

  /**
   * Handle an incoming deep link URL
   *
   * NOTE: Strips the protocol and main key, passing only dynamic segments to handlers.
   * Supports both twig:// and legacy array:// protocols.
   */
  public handleUrl(url: string): boolean {
    log.info("Received deep link:", url);

    const isTwigProtocol = url.startsWith(`${PROTOCOL}://`);
    const isLegacyProtocol = url.startsWith(`${LEGACY_PROTOCOL}://`);

    if (!isTwigProtocol && !isLegacyProtocol) {
      log.warn("URL does not match protocol:", url);
      return false;
    }

    try {
      const parsedUrl = new URL(url);

      // The hostname is the main key (e.g., "task" in array://task/...)
      const mainKey = parsedUrl.hostname;

      if (!mainKey) {
        log.warn("Deep link has no main key:", url);
        return false;
      }

      const handler = this.handlers.get(mainKey);
      if (!handler) {
        log.warn("No handler registered for deep link key:", mainKey);
        return false;
      }

      // Extract path segments after the main key (strip leading slash)
      const pathSegments = parsedUrl.pathname.slice(1);

      log.info(
        `Routing deep link to '${mainKey}' handler with path: ${pathSegments || "(empty)"}`,
      );
      return handler(pathSegments, parsedUrl.searchParams);
    } catch (error) {
      log.error("Failed to parse deep link URL:", error);
      return false;
    }
  }

  public getProtocol(): string {
    return PROTOCOL;
  }
}
