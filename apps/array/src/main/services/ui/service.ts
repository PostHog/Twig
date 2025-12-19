import { injectable } from "inversify";
import { TypedEventEmitter } from "../../lib/typed-event-emitter.js";
import { UIServiceEvent, type UIServiceEvents } from "./schemas.js";

@injectable()
export class UIService extends TypedEventEmitter<UIServiceEvents> {
  openSettings(): void {
    this.emit(UIServiceEvent.OpenSettings, true);
  }

  newTask(): void {
    this.emit(UIServiceEvent.NewTask, true);
  }

  resetLayout(): void {
    this.emit(UIServiceEvent.ResetLayout, true);
  }

  clearStorage(): void {
    this.emit(UIServiceEvent.ClearStorage, true);
  }
}
