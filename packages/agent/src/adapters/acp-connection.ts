import { AgentSideConnection, ndJsonStream } from "@agentclientprotocol/sdk";
import { POSTHOG_NOTIFICATIONS } from "../acp-extensions.js";
import type { SessionLogWriter } from "../session-log-writer.js";
import type { ProcessSpawnedCallback } from "../types.js";
import { Logger } from "../utils/logger.js";
import {
  createBidirectionalStreams,
  createTappedWritableStream,
  nodeReadableToWebReadable,
  nodeWritableToWebWritable,
  type StreamPair,
} from "../utils/streams.js";
import { ClaudeAcpAgent } from "./claude/claude-agent.js";
import { type CodexProcessOptions, spawnCodexProcess } from "./codex/spawn.js";

export type AgentAdapter = "claude" | "codex";

export type AcpConnectionConfig = {
  adapter?: AgentAdapter;
  logWriter?: SessionLogWriter;
  taskRunId?: string;
  taskId?: string;
  /** Deployment environment - "local" for desktop, "cloud" for cloud sandbox */
  deviceType?: "local" | "cloud";
  logger?: Logger;
  /** Enable dev-only instrumentation (timing, verbose logging) */
  debug?: boolean;
  processCallbacks?: ProcessSpawnedCallback;
  codexOptions?: CodexProcessOptions;
  allowedModelIds?: Set<string>;
};

export type AcpConnection = {
  agentConnection?: AgentSideConnection;
  clientStreams: StreamPair;
  cleanup: () => Promise<void>;
};

export type InProcessAcpConnection = AcpConnection;

type ConfigOption = {
  id?: string;
  category?: string | null;
  currentValue?: string;
  options?: Array<
    { value?: string } | { group?: string; options?: Array<{ value?: string }> }
  >;
};

function isGroupedOptions(
  options: NonNullable<ConfigOption["options"]>,
): options is Array<{ group?: string; options?: Array<{ value?: string }> }> {
  return options.length > 0 && "group" in options[0];
}

function filterModelConfigOptions(
  msg: Record<string, unknown>,
  allowedModelIds: Set<string>,
): Record<string, unknown> | null {
  const payload = msg as {
    method?: string;
    result?: { configOptions?: ConfigOption[] };
    params?: {
      update?: { sessionUpdate?: string; configOptions?: ConfigOption[] };
    };
  };

  const configOptions =
    payload.result?.configOptions ?? payload.params?.update?.configOptions;
  if (!configOptions) return null;

  const filtered = configOptions.map((opt) => {
    if (opt.category !== "model" || !opt.options) return opt;

    const options = opt.options;
    if (isGroupedOptions(options)) {
      const filteredOptions = options.map((group) => ({
        ...group,
        options: (group.options ?? []).filter(
          (o) => o?.value && allowedModelIds.has(o.value),
        ),
      }));
      const flat = filteredOptions.flatMap((g) => g.options ?? []);
      const currentAllowed =
        opt.currentValue && allowedModelIds.has(opt.currentValue);
      const nextCurrent =
        currentAllowed || flat.length === 0 ? opt.currentValue : flat[0]?.value;

      return {
        ...opt,
        currentValue: nextCurrent,
        options: filteredOptions,
      };
    }

    const valueOptions = options as Array<{ value?: string }>;
    const filteredOptions = valueOptions.filter(
      (o) => o?.value && allowedModelIds.has(o.value),
    );
    const currentAllowed =
      opt.currentValue && allowedModelIds.has(opt.currentValue);
    const nextCurrent =
      currentAllowed || filteredOptions.length === 0
        ? opt.currentValue
        : filteredOptions[0]?.value;

    return {
      ...opt,
      currentValue: nextCurrent,
      options: filteredOptions,
    };
  });

  if (payload.result?.configOptions) {
    return { ...msg, result: { ...payload.result, configOptions: filtered } };
  }
  if (payload.params?.update?.configOptions) {
    return {
      ...msg,
      params: {
        ...payload.params,
        update: { ...payload.params.update, configOptions: filtered },
      },
    };
  }
  return null;
}

function extractReasoningEffort(
  configOptions: ConfigOption[] | undefined,
): string | undefined {
  if (!configOptions) return undefined;
  const option = configOptions.find((opt) => opt.id === "reasoning_effort");
  return option?.currentValue ?? undefined;
}

/**
 * Creates an ACP connection with the specified agent framework.
 *
 * @param config - Configuration including framework selection
 * @returns Connection with agent and client streams
 */
export function createAcpConnection(
  config: AcpConnectionConfig = {},
): AcpConnection {
  const adapterType = config.adapter ?? "claude";

  if (adapterType === "codex") {
    return createCodexConnection(config);
  }

  return createClaudeConnection(config);
}

function createClaudeConnection(config: AcpConnectionConfig): AcpConnection {
  const logger =
    config.logger?.child("AcpConnection") ??
    new Logger({ debug: true, prefix: "[AcpConnection]" });
  const streams = createBidirectionalStreams();

  const { logWriter } = config;

  let agentWritable = streams.agent.writable;
  let clientWritable = streams.client.writable;

  if (config.taskRunId && logWriter) {
    if (!logWriter.isRegistered(config.taskRunId)) {
      logWriter.register(config.taskRunId, {
        taskId: config.taskId ?? config.taskRunId,
        runId: config.taskRunId,
        deviceType: config.deviceType,
      });
    }

    agentWritable = createTappedWritableStream(streams.agent.writable, {
      onMessage: (line) => {
        logWriter.appendRawLine(config.taskRunId!, line);
      },
      logger,
    });

    clientWritable = createTappedWritableStream(streams.client.writable, {
      onMessage: (line) => {
        logWriter.appendRawLine(config.taskRunId!, line);
      },
      logger,
    });
  } else {
    logger.info("Tapped streams NOT enabled", {
      hasTaskRunId: !!config.taskRunId,
      hasLogWriter: !!logWriter,
    });
  }

  const agentStream = ndJsonStream(agentWritable, streams.agent.readable);

  let agent: ClaudeAcpAgent | null = null;
  const agentConnection = new AgentSideConnection((client) => {
    agent = new ClaudeAcpAgent(client, logWriter, {
      ...config.processCallbacks,
      debug: config.debug,
    });
    logger.info(`Created ${agent.adapterName} agent`);
    return agent;
  }, agentStream);

  return {
    agentConnection,
    clientStreams: {
      readable: streams.client.readable,
      writable: clientWritable,
    },
    cleanup: async () => {
      logger.info("Cleaning up ACP connection");

      if (agent) {
        await agent.closeSession();
      }

      try {
        await streams.client.writable.close();
      } catch {
        // Stream may already be closed
      }
      try {
        await streams.agent.writable.close();
      } catch {
        // Stream may already be closed
      }
    },
  };
}

function createCodexConnection(config: AcpConnectionConfig): AcpConnection {
  const logger =
    config.logger?.child("CodexConnection") ??
    new Logger({ debug: true, prefix: "[CodexConnection]" });

  const { logWriter } = config;
  const allowedModelIds = config.allowedModelIds;

  const codexProcess = spawnCodexProcess({
    ...config.codexOptions,
    logger,
    processCallbacks: config.processCallbacks,
  });

  let clientReadable = nodeReadableToWebReadable(codexProcess.stdout);
  let clientWritable = nodeWritableToWebWritable(codexProcess.stdin);

  let isLoadingSession = false;
  let loadRequestId: string | number | null = null;
  let newSessionRequestId: string | number | null = null;
  let sdkSessionEmitted = false;
  const reasoningEffortBySessionId = new Map<string, string>();
  let injectedConfigId = 0;

  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  let readBuffer = "";

  const taskRunId = config.taskRunId;

  const filteringReadable = clientReadable.pipeThrough(
    new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, controller) {
        readBuffer += decoder.decode(chunk, { stream: true });
        const lines = readBuffer.split("\n");
        readBuffer = lines.pop() ?? "";

        const outputLines: string[] = [];

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) {
            outputLines.push(line);
            continue;
          }

          let shouldFilter = false;

          try {
            const msg = JSON.parse(trimmed);
            const sessionId =
              msg?.params?.sessionId ?? msg?.result?.sessionId ?? null;
            const configOptions =
              msg?.result?.configOptions ?? msg?.params?.update?.configOptions;
            if (sessionId && configOptions) {
              const effort = extractReasoningEffort(configOptions);
              if (effort) {
                reasoningEffortBySessionId.set(sessionId, effort);
              }
            }

            if (
              !sdkSessionEmitted &&
              newSessionRequestId !== null &&
              msg.id === newSessionRequestId &&
              "result" in msg
            ) {
              const sessionId = msg.result?.sessionId;
              if (sessionId && taskRunId) {
                const sdkSessionNotification = {
                  jsonrpc: "2.0",
                  method: POSTHOG_NOTIFICATIONS.SDK_SESSION,
                  params: {
                    taskRunId,
                    sessionId,
                    adapter: "codex",
                  },
                };
                outputLines.push(JSON.stringify(sdkSessionNotification));
                sdkSessionEmitted = true;
              }
              newSessionRequestId = null;
            }

            if (isLoadingSession) {
              if (msg.id === loadRequestId && "result" in msg) {
                logger.debug("session/load complete, resuming stream");
                isLoadingSession = false;
                loadRequestId = null;
              } else if (msg.method === "session/update") {
                shouldFilter = true;
              }
            }

            if (!shouldFilter && allowedModelIds && allowedModelIds.size > 0) {
              const updated = filterModelConfigOptions(msg, allowedModelIds);
              if (updated) {
                outputLines.push(JSON.stringify(updated));
                continue;
              }
            }
          } catch {
            // Not valid JSON, pass through
          }

          if (!shouldFilter) {
            outputLines.push(line);
            const isChunkNoise =
              trimmed.includes('"sessionUpdate":"agent_message_chunk"') ||
              trimmed.includes('"sessionUpdate":"agent_thought_chunk"');
            if (!isChunkNoise) {
              logger.debug("codex-acp stdout:", trimmed);
            }
          }
        }

        if (outputLines.length > 0) {
          const output = `${outputLines.join("\n")}\n`;
          controller.enqueue(encoder.encode(output));
        }
      },
      flush(controller) {
        if (readBuffer.trim()) {
          controller.enqueue(encoder.encode(readBuffer));
        }
      },
    }),
  );
  clientReadable = filteringReadable;

  const originalWritable = clientWritable;
  clientWritable = new WritableStream({
    write(chunk) {
      const text = decoder.decode(chunk, { stream: true });
      const trimmed = text.trim();
      logger.debug("codex-acp stdin:", trimmed);

      try {
        const msg = JSON.parse(trimmed);
        if (
          msg.method === "session/set_config_option" &&
          msg.params?.configId === "reasoning_effort" &&
          msg.params?.sessionId &&
          msg.params?.value
        ) {
          reasoningEffortBySessionId.set(
            msg.params.sessionId,
            msg.params.value,
          );
        }
        if (msg.method === "session/prompt" && msg.params?.sessionId) {
          const effort = reasoningEffortBySessionId.get(msg.params.sessionId);
          if (effort) {
            const injection = {
              jsonrpc: "2.0",
              id: `reasoning_effort_${Date.now()}_${injectedConfigId++}`,
              method: "session/set_config_option",
              params: {
                sessionId: msg.params.sessionId,
                configId: "reasoning_effort",
                value: effort,
              },
            };
            const injectionLine = `${JSON.stringify(injection)}\n`;
            const writer = originalWritable.getWriter();
            return writer
              .write(encoder.encode(injectionLine))
              .then(() => writer.releaseLock())
              .then(() => {
                const nextWriter = originalWritable.getWriter();
                return nextWriter
                  .write(chunk)
                  .finally(() => nextWriter.releaseLock());
              });
          }
        }
        if (msg.method === "session/new" && msg.id) {
          logger.debug("session/new detected, tracking request ID");
          newSessionRequestId = msg.id;
        } else if (msg.method === "session/load" && msg.id) {
          logger.debug("session/load detected, pausing stream updates");
          isLoadingSession = true;
          loadRequestId = msg.id;
        }
      } catch {
        // Not valid JSON
      }

      const writer = originalWritable.getWriter();
      return writer.write(chunk).finally(() => writer.releaseLock());
    },
    close() {
      const writer = originalWritable.getWriter();
      return writer.close().finally(() => writer.releaseLock());
    },
  });

  const shouldTapLogs = config.taskRunId && logWriter;

  if (shouldTapLogs) {
    const taskRunId = config.taskRunId!;
    if (!logWriter.isRegistered(taskRunId)) {
      logWriter.register(taskRunId, {
        taskId: config.taskId ?? taskRunId,
        runId: taskRunId,
      });
    }

    clientWritable = createTappedWritableStream(clientWritable, {
      onMessage: (line) => {
        logWriter.appendRawLine(taskRunId, line);
      },
      logger,
    });

    const originalReadable = clientReadable;
    const logDecoder = new TextDecoder();
    let logBuffer = "";

    clientReadable = originalReadable.pipeThrough(
      new TransformStream<Uint8Array, Uint8Array>({
        transform(chunk, controller) {
          logBuffer += logDecoder.decode(chunk, { stream: true });
          const lines = logBuffer.split("\n");
          logBuffer = lines.pop() ?? "";

          for (const line of lines) {
            if (line.trim()) {
              logWriter.appendRawLine(taskRunId, line);
            }
          }

          controller.enqueue(chunk);
        },
        flush() {
          if (logBuffer.trim()) {
            logWriter.appendRawLine(taskRunId, logBuffer);
          }
        },
      }),
    );
  } else {
    logger.info("Tapped streams NOT enabled for Codex", {
      hasTaskRunId: !!config.taskRunId,
      hasLogWriter: !!logWriter,
    });
  }

  return {
    agentConnection: undefined,
    clientStreams: {
      readable: clientReadable,
      writable: clientWritable,
    },
    cleanup: async () => {
      logger.info("Cleaning up Codex connection");
      codexProcess.kill();

      try {
        await clientWritable.close();
      } catch {
        // Stream may already be closed
      }
    },
  };
}
