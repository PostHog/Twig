import { randomUUID } from "node:crypto";
import { mkdirSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Agent, type OnLogCallback, PermissionMode } from "@posthog/agent";
import {
  app,
  type BrowserWindow,
  type IpcMainInvokeEvent,
  ipcMain,
} from "electron";
import { logger } from "../lib/logger";

const log = logger.scope("agent");

const onAgentLog: OnLogCallback = (level, scope, message, data) => {
  const scopedLog = logger.scope(scope);
  if (data !== undefined) {
    scopedLog[level as keyof typeof scopedLog](message, data);
  } else {
    scopedLog[level](message);
  }
};

interface AgentStartParams {
  taskId: string;
  taskRunId: string;
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

function getClaudeCliPath(): string {
  const appPath = app.getAppPath();

  const claudeCliPath = app.isPackaged
    ? join(`${appPath}.unpacked`, ".vite/build/claude-cli/cli.js")
    : join(appPath, ".vite/build/claude-cli/cli.js");

  return claudeCliPath;
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
        taskRunId,
        repoPath,
        apiKey,
        apiHost,
        projectId,
        permissionMode,
        autoProgress,
        model,
        runMode: _runMode, // TODO: Add support for cloud runs
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

      // Workaround for claude-agent-sdk bug where cached tool definitions include input_examples
      // Clear the statsig cache to force regeneration without input_examples
      // See: https://github.com/anthropics/claude-code/issues/11678
      try {
        const claudeConfigDir =
          process.env.CLAUDE_CONFIG_DIR || join(app.getPath("home"), ".claude");
        const statsigPath = join(claudeConfigDir, "statsig");
        rmSync(statsigPath, { recursive: true, force: true });
        log.info("Cleared statsig cache to work around input_examples bug");
      } catch (error) {
        log.warn("Could not clear statsig cache:", error);
      }

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
        log.error(`[claude-stderr] ${text}`);
        emitToRenderer({
          type: "status",
          ts: Date.now(),
          message: `[Claude stderr] ${text}`,
        });

        // Propagate spawn errors specifically to help debugging
        if (text.includes("spawn") && text.includes("ENOENT")) {
          emitToRenderer({
            type: "error",
            ts: Date.now(),
            message: `Critical Agent Error: ${text}`,
          });
        }
      };

      const agent = new Agent({
        workingDirectory: repoPath,
        posthogApiKey: apiKey,
        posthogApiUrl: apiHost,
        posthogProjectId: projectId,
        debug: !app.isPackaged,
        onLog: onAgentLog,
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

              log.debug("Task progress poll", {
                runId: latestRun.id,
                status: latestRun.status,
                hasLogUrl: !!latestRun.log_url,
              });

              emitToRenderer({
                type: "progress",
                ts: Date.now(),
                progress: latestRun,
              });
            }
          } catch (err) {
            log.warn("Failed to fetch task progress", err);
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
          // Create a temporary directory to mock 'node' in PATH
          // Electron apps don't have 'node' in PATH, and process.execPath points to the App binary
          // We symlink 'node' -> process.execPath and add this dir to PATH
          const mockNodeDir = join(tmpdir(), `array-agent-node-${taskId}`);
          try {
            mkdirSync(mockNodeDir, { recursive: true });
            const nodeSymlinkPath = join(mockNodeDir, "node");
            // Remove existing symlink if it exists
            try {
              rmSync(nodeSymlinkPath, { force: true });
            } catch {}
            symlinkSync(process.execPath, nodeSymlinkPath);
          } catch (err) {
            log.warn("Failed to setup mock node environment", err);
          }

          const newPath = `${mockNodeDir}:${process.env.PATH || ""}`;

          const envOverrides = {
            ...process.env,
            PATH: newPath,
            POSTHOG_API_KEY: apiKey,
            POSTHOG_API_HOST: apiHost,
            POSTHOG_AUTH_HEADER: `Bearer ${apiKey}`,
            ANTHROPIC_API_KEY: apiKey,
            ANTHROPIC_AUTH_TOKEN: apiKey,
            ANTHROPIC_BASE_URL: `${apiHost}/api/projects/${projectId}/llm_gateway`,
            // Ensure we can run node in the packaged app
            ELECTRON_RUN_AS_NODE: "1",
          };

          const mcpOverrides = {};
          const claudeCliPath = getClaudeCliPath();

          await agent.runTask(posthogTaskId, taskRunId, {
            repositoryPath: repoPath,
            permissionMode: resolvedPermission,
            isCloudMode: false,
            autoProgress: autoProgress ?? true,
            createPR: createPR ?? true,
            queryOverrides: {
              abortController,
              ...(model ? { model } : {}),
              stderr: forwardClaudeStderr,
              env: envOverrides,
              mcpServers: mcpOverrides,
              pathToClaudeCodeExecutable: claudeCliPath,
              nodePath: process.execPath,
            },
          });

          // Clean up mock node dir
          try {
            rmSync(mockNodeDir, { recursive: true, force: true });
          } catch {}

          emitToRenderer({ type: "done", success: true, ts: Date.now() });
        } catch (err) {
          log.error("Task execution failed", err);
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
