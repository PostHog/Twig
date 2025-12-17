import { inject, injectable } from "inversify";
import { MAIN_TOKENS } from "../../di/tokens.js";
import { logger } from "../../lib/logger.js";
import { TypedEventEmitter } from "../../lib/typed-event-emitter.js";
import { getMainWindow } from "../../trpc/context.js";
import type { DeepLinkService } from "../deep-link/service.js";

const log = logger.scope("task-link-service");

export const TaskLinkEvent = {
  OpenTask: "openTask",
} as const;

export interface TaskLinkEvents {
  [TaskLinkEvent.OpenTask]: { taskId: string };
}

@injectable()
export class TaskLinkService extends TypedEventEmitter<TaskLinkEvents> {
  /**
   * Pending task ID that was received before renderer was ready.
   * This handles the case where the app is launched via deep link.
   */
  private pendingTaskId: string | null = null;

  constructor(
    @inject(MAIN_TOKENS.DeepLinkService)
    private readonly deepLinkService: DeepLinkService,
  ) {
    super();

    this.deepLinkService.registerHandler("task", (path) =>
      this.handleTaskLink(path),
    );
    log.info("Registered task link handler for deep links");
  }

  private handleTaskLink(path: string): boolean {
    // path is just the taskId (e.g., "abc123" from array://task/abc123)
    const taskId = path.split("/")[0];

    if (!taskId) {
      log.warn("Task link missing task ID");
      return false;
    }

    // Check if renderer is ready (has any listeners)
    const hasListeners = this.listenerCount(TaskLinkEvent.OpenTask) > 0;

    if (hasListeners) {
      log.info(`Emitting task link event: ${taskId}`);
      this.emit(TaskLinkEvent.OpenTask, { taskId });
    } else {
      // Renderer not ready yet - queue it for later
      log.info(`Queueing task link (renderer not ready): ${taskId}`);
      this.pendingTaskId = taskId;
    }

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

  /**
   * Get and clear any pending task ID.
   * Called by renderer on mount to handle deep links that arrived before it was ready.
   */
  public consumePendingTaskId(): string | null {
    const taskId = this.pendingTaskId;
    this.pendingTaskId = null;
    if (taskId) {
      log.info(`Consumed pending task link: ${taskId}`);
    }
    return taskId;
  }
}
