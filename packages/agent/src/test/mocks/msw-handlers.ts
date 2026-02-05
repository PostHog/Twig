import { HttpResponse, http } from "msw";
import { SseController } from "../controllers/sse-controller.js";

export { SseController };

type AnyHttpResponse = Response | ReturnType<typeof HttpResponse.json>;

export interface PostHogHandlersOptions {
  baseUrl?: string;
  onAppendLog?: (entries: unknown[]) => void;
  getTaskRun?: () => unknown;
  appendLogResponse?: () => AnyHttpResponse;
}

export function createPostHogHandlers(options: PostHogHandlersOptions = {}) {
  const {
    baseUrl = "http://localhost:8000",
    onAppendLog,
    getTaskRun,
    appendLogResponse,
  } = options;

  return [
    // POST /append_log/ - Agent log entries
    http.post(
      `${baseUrl}/api/projects/:projectId/tasks/:taskId/runs/:runId/append_log/`,
      async ({ request }) => {
        if (appendLogResponse) {
          return appendLogResponse();
        }
        const body = (await request.json()) as { entries: unknown[] };
        if (body.entries?.length > 0) {
          onAppendLog?.(body.entries);
        }
        return HttpResponse.json({});
      },
    ),

    // GET /runs/:runId - Fetch task run details
    http.get(
      `${baseUrl}/api/projects/:projectId/tasks/:taskId/runs/:runId`,
      () => {
        const taskRun = getTaskRun?.() ?? { log_url: "" };
        return HttpResponse.json(taskRun);
      },
    ),
  ];
}
