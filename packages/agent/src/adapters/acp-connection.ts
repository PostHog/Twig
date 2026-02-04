import { AgentSideConnection, ndJsonStream } from "@agentclientprotocol/sdk";
import { POSTHOG_NOTIFICATIONS } from "@/acp-extensions.js";
import type { SessionLogWriter } from "@/session-log-writer.js";
import { Logger } from "@/utils/logger.js";
import {
  createBidirectionalStreams,
  createTappedWritableStream,
  nodeReadableToWebReadable,
  nodeWritableToWebWritable,
  type StreamPair,
} from "@/utils/streams.js";
import {
  ClaudeAcpAgent,
  type ClaudeAcpAgentOptions,
} from "./claude/claude-agent.js";
import { type CodexProcessOptions, spawnCodexProcess } from "./codex/spawn.js";

export type AgentAdapter = "claude" | "codex";

export type AcpConnectionConfig = {
  adapter?: AgentAdapter;
  logWriter?: SessionLogWriter;
  taskRunId?: string;
  taskId?: string;
  logger?: Logger;
  processCallbacks?: ClaudeAcpAgentOptions;
  codexOptions?: CodexProcessOptions;
};

export type AcpConnection = {
  agentConnection?: AgentSideConnection;
  clientStreams: StreamPair;
  cleanup: () => Promise<void>;
};

export type InProcessAcpConnection = AcpConnection;

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
    agent = new ClaudeAcpAgent(client, logWriter, config.processCallbacks);
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

  const codexProcess = spawnCodexProcess({
    ...config.codexOptions,
    logger,
  });

  let clientReadable = nodeReadableToWebReadable(codexProcess.stdout);
  let clientWritable = nodeWritableToWebWritable(codexProcess.stdin);

  let isLoadingSession = false;
  let loadRequestId: string | number | null = null;
  let newSessionRequestId: string | number | null = null;
  let sdkSessionEmitted = false;

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
                logger.debug("Filtering replay session/update during load");
                shouldFilter = true;
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
