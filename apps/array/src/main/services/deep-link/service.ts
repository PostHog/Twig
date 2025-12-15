import { app } from "electron";
import { injectable } from "inversify";
import { logger } from "../../lib/logger.js";

const log = logger.scope("deep-link-service");

const PROTOCOL = "array";

export type DeepLinkHandler = (url: URL) => boolean;

@injectable()
export class DeepLinkService {
  private protocolRegistered = false;
  private handlers = new Map<string, DeepLinkHandler>();

  /**
   * Register the app as the default handler for the 'array' protocol.
   * Should be called once during app initialization (in whenReady).
   */
  public registerProtocol(): void {
    if (this.protocolRegistered) {
      return;
    }

    // Register the protocol
    if (process.defaultApp) {
      // Development: need to register with path to electron
      if (process.argv.length >= 2) {
        app.setAsDefaultProtocolClient(PROTOCOL, process.execPath, [
          process.argv[1],
        ]);
      }
    } else {
      // Production
      app.setAsDefaultProtocolClient(PROTOCOL);
    }

    this.protocolRegistered = true;
    log.info(`Registered '${PROTOCOL}' protocol handler`);
  }

  /**
   * Register a handler for a specific deep link path.
   * @param path The path to handle (e.g., "callback", "task", "settings")
   * @param handler Function that receives the parsed URL and returns true if handled
   */
  public registerHandler(path: string, handler: DeepLinkHandler): void {
    if (this.handlers.has(path)) {
      log.warn(`Overwriting existing handler for path: ${path}`);
    }
    this.handlers.set(path, handler);
    log.info(`Registered deep link handler for path: ${path}`);
  }

  /**
   * Unregister a handler for a specific path.
   */
  public unregisterHandler(path: string): void {
    this.handlers.delete(path);
  }

  /**
   * Handle an incoming deep link URL.
   * Routes to the appropriate registered handler based on the URL path.
   * @returns true if the URL was handled, false otherwise
   */
  public handleUrl(url: string): boolean {
    log.info("Received deep link:", url);

    if (!url.startsWith(`${PROTOCOL}://`)) {
      log.warn("URL does not match protocol:", url);
      return false;
    }

    try {
      const parsedUrl = new URL(url);

      // The "path" can be the hostname (array://callback) or pathname (array://foo/callback)
      // For simple paths like array://callback, hostname is "callback" and pathname is "/"
      // For paths like array://oauth/callback, hostname is "oauth" and pathname is "/callback"
      const path = parsedUrl.hostname || parsedUrl.pathname.slice(1);

      const handler = this.handlers.get(path);
      if (handler) {
        return handler(parsedUrl);
      }

      // Try matching with pathname for nested paths like array://oauth/callback
      if (parsedUrl.pathname !== "/") {
        const fullPath = `${parsedUrl.hostname}${parsedUrl.pathname}`;
        const nestedHandler = this.handlers.get(fullPath);
        if (nestedHandler) {
          return nestedHandler(parsedUrl);
        }
      }

      log.warn("No handler registered for deep link path:", path);
      return false;
    } catch (error) {
      log.error("Failed to parse deep link URL:", error);
      return false;
    }
  }

  /**
   * Get the protocol name.
   */
  public getProtocol(): string {
    return PROTOCOL;
  }
}
