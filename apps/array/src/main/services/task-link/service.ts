import { EventEmitter } from "node:events";
import { injectable } from "inversify";
import { logger } from "../../lib/logger.js";
import { getMainWindow } from "../../trpc/context.js";
import type { DeepLinkHandler } from "../deep-link/service.js";

const log = logger.scope("task-link-service");

@injectable()
export class TaskLinkService {
  private emitter = new EventEmitter();

  /**
   * Get the deep link handler for task links.
   * Register this with DeepLinkService for the "task" key.
   * Expects URLs like: array://task/{taskId}
   */
  public getDeepLinkHandler(): DeepLinkHandler {
    return (path) => this.handleTaskLink(path);
  }

  /**
   * Subscribe to task link events.
   */
  public onTaskLink(callback: (taskId: string) => void): () => void {
    this.emitter.on("task", callback);
    return () => this.emitter.off("task", callback);
  }

  private handleTaskLink(path: string): boolean {
    // path is just the taskId (e.g., "abc123" from array://task/abc123)
    const taskId = path.split("/")[0];

    if (!taskId) {
      log.warn("Task link missing task ID");
      return false;
    }

    log.info(`Emitting task link event: ${taskId}`);
    this.emitter.emit("task", taskId);

    // Focus the window
    const mainWindow = getMainWindow();
    if (mainWindow) {
      if (mainWindow.isMinimized()) {
        mainWindow.restore();
      }
      mainWindow.focus();
    }

    return true;
  }
}
