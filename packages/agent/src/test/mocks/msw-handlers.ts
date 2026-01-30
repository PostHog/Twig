import { HttpResponse, http } from "msw";
import { SseController } from "../controllers/sse-controller.js";

export { SseController };

type AnyHttpResponse = Response | ReturnType<typeof HttpResponse.json>;

export interface PostHogHandlersOptions {
  baseUrl?: string;
  onAppendLog?: (entries: unknown[]) => void;
  onHeartbeat?: () => void;
  onSyncRequest?: (request: Request) => void;
  getTaskRun?: () => unknown;
  sseController?: SseController;
  getSseController?: () => SseController | undefined;
  /** @deprecated Use syncPostResponse instead */
  appendLogResponse?: () => AnyHttpResponse;
  syncPostResponse?: () => AnyHttpResponse;
}

function hasHeartbeatEvent(entries: unknown[]): boolean {
  return entries.some(
    (entry) =>
      typeof entry === "object" &&
      entry !== null &&
      (entry as Record<string, unknown>).type === "heartbeat",
  );
}

function filterNonHeartbeatEvents(entries: unknown[]): unknown[] {
  return entries.filter(
    (entry) =>
      !(
        typeof entry === "object" &&
        entry !== null &&
        (entry as Record<string, unknown>).type === "heartbeat"
      ),
  );
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
    appendLogResponse,
    syncPostResponse,
  } = options;

  return [
    http.get(
      `${baseUrl}/api/projects/:projectId/tasks/:taskId/runs/:runId/sync`,
      ({ request }) => {
        onSyncRequest?.(request);
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
      },
    ),

    http.post(
      `${baseUrl}/api/projects/:projectId/tasks/:taskId/runs/:runId/sync`,
      async ({ request }) => {
        const responseOverride = syncPostResponse ?? appendLogResponse;
        if (responseOverride) {
          return responseOverride();
        }
        const body = (await request.json()) as { entries: unknown[] };
        if (hasHeartbeatEvent(body.entries)) {
          onHeartbeat?.();
        }
        const nonHeartbeatEntries = filterNonHeartbeatEvents(body.entries);
        if (nonHeartbeatEntries.length > 0) {
          onAppendLog?.(nonHeartbeatEntries);
        }
        return HttpResponse.json({});
      },
    ),

    http.get(
      `${baseUrl}/api/projects/:projectId/tasks/:taskId/runs/:runId`,
      () => {
        const taskRun = getTaskRun?.() ?? { log_url: "" };
        return HttpResponse.json(taskRun);
      },
    ),
  ];
}
