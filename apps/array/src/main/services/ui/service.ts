import { injectable } from "inversify";
import { TypedEventEmitter } from "../../lib/typed-event-emitter.js";
import { UIServiceEvent, type UIServiceEvents } from "./schemas.js";

/**
 * UIService handles UI events that need to be communicated from main to renderer.
 * These are typically triggered by menu items or other main process actions.
 */
@injectable()
export class UIService extends TypedEventEmitter<UIServiceEvents> {
  /**
   * Emit an event to open the settings panel
   */
  openSettings(): void {
    this.emit(UIServiceEvent.OpenSettings, undefined);
  }

  /**
   * Emit an event to create a new task
   */
  newTask(): void {
    this.emit(UIServiceEvent.NewTask, undefined);
  }

  /**
   * Emit an event to reset the layout
   */
  resetLayout(): void {
    this.emit(UIServiceEvent.ResetLayout, undefined);
  }

  /**
   * Emit an event to clear storage
   */
  clearStorage(): void {
    this.emit(UIServiceEvent.ClearStorage, undefined);
  }
}
