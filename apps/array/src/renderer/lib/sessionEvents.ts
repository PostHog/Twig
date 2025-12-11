type SessionEventType = "prompt:complete";

interface PromptCompleteEvent {
  taskId: string;
  taskRunId: string;
  stopReason: string;
}

type SessionEventPayload = {
  "prompt:complete": PromptCompleteEvent;
};

type SessionEventListener<T extends SessionEventType> = (
  payload: SessionEventPayload[T],
) => void;

class SessionEventEmitter {
  private listeners: Map<SessionEventType, Set<SessionEventListener<never>>> =
    new Map();

  on<T extends SessionEventType>(
    event: T,
    listener: SessionEventListener<T>,
  ): () => void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)?.add(listener as SessionEventListener<never>);

    // Return unsubscribe function
    return () => {
      this.listeners
        .get(event)
        ?.delete(listener as SessionEventListener<never>);
    };
  }

  emit<T extends SessionEventType>(
    event: T,
    payload: SessionEventPayload[T],
  ): void {
    this.listeners.get(event)?.forEach((listener) => {
      listener(payload as never);
    });
  }
}

export const sessionEvents = new SessionEventEmitter();
