import { http, HttpResponse } from "msw";

export interface PostHogHandlersOptions {
  baseUrl?: string;
  onAppendLog?: (entries: unknown[]) => void;
  onHeartbeat?: () => void;
  onSyncRequest?: () => void;
  getTaskRun?: () => unknown;
  sseController?: SseController;
  getSseController?: () => SseController | undefined;
}

export class SseController {
  private encoder = new TextEncoder();
  private controller: ReadableStreamDefaultController<Uint8Array> | null = null;
  private isClosed = false;

  createStream(): ReadableStream<Uint8Array> {
    return new ReadableStream({
      start: (controller) => {
        this.controller = controller;
      },
      cancel: () => {
        this.isClosed = true;
      },
    });
  }

  sendEvent(data: unknown, options: { id?: string; event?: string } = {}): void {
    if (this.isClosed || !this.controller) {
      return;
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

    this.controller.enqueue(this.encoder.encode(lines.join("\n")));
  }

  close(): void {
    if (!this.isClosed && this.controller) {
      this.isClosed = true;
      try {
        this.controller.close();
      } catch {
        // Stream may already be closed
      }
    }
  }

  get closed(): boolean {
    return this.isClosed;
  }
}

export function createPostHogHandlers(options: PostHogHandlersOptions = {}) {
  const {
    baseUrl = "http://localhost:8000",
    onAppendLog,
    onHeartbeat,
    onSyncRequest,
    getTaskRun,
    sseController,
    getSseController,
  } = options;

  return [
    http.get(`${baseUrl}/api/projects/:projectId/tasks/:taskId/runs/:runId/sync`, () => {
      onSyncRequest?.();
      const controller = getSseController?.() ?? sseController;
      if (!controller) {
        return new HttpResponse(null, { status: 503 });
      }

      const stream = controller.createStream();
      return new HttpResponse(stream, {
        status: 200,
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
        },
      });
    }),

    http.post(
      `${baseUrl}/api/projects/:projectId/tasks/:taskId/runs/:runId/append_log`,
      async ({ request }) => {
        const body = (await request.json()) as { entries: unknown[] };
        onAppendLog?.(body.entries);
        return HttpResponse.json({});
      },
    ),

    http.post(
      `${baseUrl}/api/projects/:projectId/tasks/:taskId/runs/:runId/heartbeat`,
      () => {
        onHeartbeat?.();
        return HttpResponse.json({});
      },
    ),

    http.get(`${baseUrl}/api/projects/:projectId/tasks/:taskId/runs/:runId`, () => {
      const taskRun = getTaskRun?.() ?? { log_url: "" };
      return HttpResponse.json(taskRun);
    }),
  ];
}
