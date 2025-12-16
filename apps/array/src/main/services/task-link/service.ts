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

    log.info(`Emitting task link event: ${taskId}`);
    this.emit(TaskLinkEvent.OpenTask, { taskId });

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
