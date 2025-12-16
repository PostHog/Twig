import { EventEmitter } from "node:events";

export class TypedEventEmitter<TEvents> extends EventEmitter {
  emit<K extends keyof TEvents & string>(
    event: K,
    payload: TEvents[K],
  ): boolean {
    return super.emit(event, payload);
  }

  on<K extends keyof TEvents & string>(
    event: K,
    listener: (payload: TEvents[K]) => void,
  ): this {
    return super.on(event, listener);
  }

  off<K extends keyof TEvents & string>(
    event: K,
    listener: (payload: TEvents[K]) => void,
  ): this {
    return super.off(event, listener);
  }
}
