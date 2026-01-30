type SseState = "idle" | "streaming" | "closing" | "closed";

export interface EventOptions {
  id?: string;
  event?: string;
}

export class SseController {
  private encoder = new TextEncoder();
  private controller: ReadableStreamDefaultController<Uint8Array> | null = null;
  private state: SseState = "idle";

  createStream(): ReadableStream<Uint8Array> {
    return new ReadableStream({
      start: (controller) => {
        this.controller = controller;
        this.state = "streaming";
      },
      cancel: () => {
        this.state = "closed";
      },
    });
  }

  sendEvent(data: unknown, options: EventOptions = {}): boolean {
    if (
      this.state === "closed" ||
      this.state === "closing" ||
      !this.controller
    ) {
      return false;
    }

    const lines: string[] = [];
    if (options.id) {
      lines.push(`id: ${options.id}`);
    }
    if (options.event) {
      lines.push(`event: ${options.event}`);
    }
    lines.push(`data: ${JSON.stringify(data)}`);
    lines.push("");
    lines.push("");

    try {
      this.controller.enqueue(this.encoder.encode(lines.join("\n")));
      return true;
    } catch {
      this.state = "closed";
      return false;
    }
  }

  sendRaw(rawData: string): boolean {
    if (
      this.state === "closed" ||
      this.state === "closing" ||
      !this.controller
    ) {
      return false;
    }
    try {
      this.controller.enqueue(this.encoder.encode(rawData));
      return true;
    } catch {
      this.state = "closed";
      return false;
    }
  }

  sendPartial(partialData: string): boolean {
    return this.sendRaw(partialData);
  }

  error(err: Error): void {
    if (this.state !== "streaming" || !this.controller) return;

    try {
      this.state = "closed";
      this.controller.error(err);
    } catch {
      // Already errored or closed
    }
  }

  close(): void {
    if (this.state === "closed") return;

    this.state = "closing";
    if (this.controller) {
      try {
        this.controller.close();
      } catch {
        // Already closed
      }
    }
    this.state = "closed";
  }

  get closed(): boolean {
    return this.state === "closed";
  }

  get currentState(): SseState {
    return this.state;
  }
}
