import { http, HttpResponse } from "msw";
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
  appendLogResponse?: () => AnyHttpResponse;
  heartbeatResponse?: () => AnyHttpResponse;
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
