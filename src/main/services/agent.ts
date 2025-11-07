import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { Agent, PermissionMode } from "@posthog/agent";
import {
  app,
  type BrowserWindow,
  type IpcMainInvokeEvent,
  ipcMain,
} from "electron";

interface AgentStartParams {
  taskId: string;
  repoPath: string;
  apiKey: string;
  apiHost: string;
  projectId: number;
  permissionMode?: PermissionMode | string;
  autoProgress?: boolean;
  model?: string;
  executionMode?: "plan";
  runMode?: "local" | "cloud";
  createPR?: boolean;
}

export interface TaskController {
  abortController: AbortController;
  agent: Agent;
  channel: string;
  taskId: string;
  poller?: NodeJS.Timeout;
  currentRunId?: string;
}

function _getClaudeCliPath(): string {
  const appPath = app.getAppPath();

  return app.isPackaged
    ? join(`${appPath}.unpacked`, ".vite/build/cli.js")
    : join(appPath, ".vite/build/cli.js");
}

function getClaudeCliPath(): string {
  const appPath = app.getAppPath();
  const isProduction = !appPath.includes("node_modules");

  return isProduction
    ? join(`${appPath}.unpacked`, ".vite/build/cli.js")
    : join(appPath, ".vite/build/cli.js");
}

function resolvePermissionMode(
  mode: AgentStartParams["permissionMode"],
): PermissionMode {
  if (!mode) return PermissionMode.ACCEPT_EDITS;
  if (typeof mode !== "string") return mode;

  const normalized = mode.trim().toLowerCase();
  const match = (Object.values(PermissionMode) as string[]).find(
    (value) => value.toLowerCase() === normalized,
  );

  return (match as PermissionMode | undefined) ?? PermissionMode.ACCEPT_EDITS;
}

export function registerAgentIpc(
  taskControllers: Map<string, TaskController>,
  getMainWindow: () => BrowserWindow | null,
): void {
  ipcMain.handle(
    "agent-start",
    async (
      _event: IpcMainInvokeEvent,
      {
        taskId: posthogTaskId,
        repoPath,
        apiKey,
        apiHost,
        projectId,
        permissionMode,
        autoProgress,
        model,
        runMode,
        createPR,
      }: AgentStartParams,
    ): Promise<{ taskId: string; channel: string }> => {
      if (!posthogTaskId || !repoPath) {
        throw new Error("taskId and repoPath are required");
      }

      if (!apiKey || !apiHost) {
        throw new Error("PostHog API credentials are required");
      }

      // Provide credentials to the PostHog MCP server used inside the agent runtime.
      process.env.POSTHOG_API_KEY = apiKey;
      process.env.POSTHOG_API_HOST = apiHost;

      const taskId = randomUUID();
      const channel = `agent-event:${taskId}`;

      const abortController = new AbortController();
      const stderrBuffer: string[] = [];

      const emitToRenderer = (payload: unknown) => {
        const win = getMainWindow?.();
        if (!win || win.isDestroyed()) return;
        win.webContents.send(channel, payload);
      };

      const forwardClaudeStderr = (chunk: string | Buffer) => {
        const text = chunk.toString().trim();
        if (!text) return;
        stderrBuffer.push(text);
        if (stderrBuffer.length > 50) {
          stderrBuffer.shift();
        }
        console.error(`[agent][claude-stderr] ${text}`);
        emitToRenderer({
          type: "status",
          ts: Date.now(),
          message: `[Claude stderr] ${text}`,
        });
      };

      const agent = new Agent({
        workingDirectory: repoPath,
        posthogApiKey: apiKey,
        posthogApiUrl: apiHost,
        posthogProjectId: projectId,
        onEvent: (event) => {
          console.log("agent event", event);
          if (!event || abortController.signal.aborted) return;
          const payload =
            event.type === "done" ? { ...event, success: true } : event;
          emitToRenderer(payload);
        },
        debug: true,
      });

      const controllerEntry: TaskController = {
        abortController,
        agent,
        channel,
        taskId: posthogTaskId,
      };

      taskControllers.set(taskId, controllerEntry);

      const posthogClient = agent.getPostHogClient();
      const startTime = Date.now();
      if (posthogClient) {
        const pollTaskProgress = async () => {
          if (abortController.signal.aborted) return;
          try {
            const task = await posthogClient.fetchTask(posthogTaskId);
            const latestRun = task?.latest_run;

            // Only emit progress for runs created after this task started
            if (
              latestRun &&
              new Date(latestRun.created_at).getTime() >= startTime
            ) {
              // Store the current run ID
              controllerEntry.currentRunId = latestRun.id;

              emitToRenderer({
                type: "progress",
                ts: Date.now(),
                progress: latestRun,
              });
            }
          } catch (err) {
            console.warn("[agent] failed to fetch task progress", err);
          }
        };

        void pollTaskProgress();
        controllerEntry.poller = setInterval(() => {
          void pollTaskProgress();
        }, 1000); // Poll every second to catch stage transitions
      }

      emitToRenderer({
        type: "status",
        ts: Date.now(),
        phase: "task_start",
        taskId: posthogTaskId,
      });

      (async () => {
        const resolvedPermission = resolvePermissionMode(permissionMode);
        try {
          const envOverrides = {
            ...process.env,
            POSTHOG_API_KEY: apiKey,
            POSTHOG_API_HOST: apiHost,
            POSTHOG_AUTH_HEADER: `Bearer ${apiKey}`,
            ANTHROPIC_API_KEY: apiKey,
            ANTHROPIC_AUTH_TOKEN: apiKey,
            ANTHROPIC_BASE_URL: `${apiHost}/api/projects/${projectId}/llm_gateway`,
          };

          const mcpOverrides = {};

          await agent.runTask(posthogTaskId, {
            repositoryPath: repoPath,
            permissionMode: resolvedPermission,
            isCloudMode: runMode === "cloud",
            autoProgress: autoProgress ?? true,
            createPR: createPR ?? true,
            queryOverrides: {
              abortController,
              ...(model ? { model } : {}),
              stderr: forwardClaudeStderr,
              env: envOverrides,
              mcpServers: mcpOverrides,
              pathToClaudeCodeExecutable: getClaudeCliPath(),
            },
          });

          emitToRenderer({ type: "done", success: true, ts: Date.now() });
        } catch (err) {
          console.error("[agent] task execution failed", err);
          let errorMessage = err instanceof Error ? err.message : String(err);
          const cause =
            err instanceof Error && "cause" in err && err.cause
              ? ` (cause: ${String(err.cause)})`
              : "";
          if (!abortController.signal.aborted) {
            if (stderrBuffer.length > 0) {
              const stderrSummary = stderrBuffer.slice(-5).join("\n");
              errorMessage += `\nLast Claude stderr:\n${stderrSummary}`;
            }
            emitToRenderer({
              type: "error",
              message: `${errorMessage}${cause}`,
              ts: Date.now(),
            });
            emitToRenderer({ type: "done", success: false, ts: Date.now() });
          } else {
            emitToRenderer({
              type: "status",
              ts: Date.now(),
              phase: "canceled",
            });
            emitToRenderer({ type: "done", success: false, ts: Date.now() });
          }
        } finally {
          if (controllerEntry.poller) {
            clearInterval(controllerEntry.poller);
          }
          taskControllers.delete(taskId);
        }
      })();

      return { taskId, channel };
    },
  );

  ipcMain.handle(
    "agent-cancel",
    async (_event: IpcMainInvokeEvent, taskId: string): Promise<boolean> => {
      const entry = taskControllers.get(taskId);
      if (!entry) return false;
      try {
        entry.abortController.abort();
        entry.agent.cancelTask(entry.taskId);
        if (entry.poller) {
          clearInterval(entry.poller);
        }
        return true;
      } finally {
        taskControllers.delete(taskId);
      }
    },
  );
}
