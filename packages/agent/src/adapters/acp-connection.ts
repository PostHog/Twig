import { AgentSideConnection, ndJsonStream } from "@agentclientprotocol/sdk";
import type { SessionLogWriter } from "@/session-log-writer.js";
import { Logger } from "@/utils/logger.js";
import {
  createBidirectionalStreams,
  createTappedWritableStream,
  type StreamPair,
} from "@/utils/streams.js";
import { ClaudeAcpAgent } from "./claude/agent.js";

export type AgentAdapter = "claude";

export type AcpConnectionConfig = {
  adapter?: AgentAdapter;
  logWriter?: SessionLogWriter;
  sessionId?: string;
  taskId?: string;
};

export type InProcessAcpConnection = {
  agentConnection: AgentSideConnection;
  clientStreams: StreamPair;
  cleanup: () => Promise<void>;
};

/**
 * Creates an ACP connection with the specified agent framework.
 *
 * @param config - Configuration including framework selection
 * @returns Connection with agent and client streams
 */
export function createAcpConnection(
  config: AcpConnectionConfig = {},
): InProcessAcpConnection {
  const logger = new Logger({ debug: true, prefix: "[AcpConnection]" });
  const streams = createBidirectionalStreams();

  const { logWriter } = config;

  let agentWritable = streams.agent.writable;
  let clientWritable = streams.client.writable;

  if (config.sessionId && logWriter) {
    if (!logWriter.isRegistered(config.sessionId)) {
      logWriter.register(config.sessionId, {
        taskId: config.taskId ?? config.sessionId,
        runId: config.sessionId,
      });
    }

    agentWritable = createTappedWritableStream(streams.agent.writable, {
      onMessage: (line) => {
        logWriter.appendRawLine(config.sessionId!, line);
      },
      logger,
    });

    clientWritable = createTappedWritableStream(streams.client.writable, {
      onMessage: (line) => {
        logWriter.appendRawLine(config.sessionId!, line);
      },
      logger,
    });
  } else {
    logger.info("Tapped streams NOT enabled", {
      hasSessionId: !!config.sessionId,
      hasLogWriter: !!logWriter,
    });
  }

  const agentStream = ndJsonStream(agentWritable, streams.agent.readable);

  const adapterType = config.adapter ?? "claude";
  let agent: ClaudeAcpAgent | null = null;
  const agentConnection = new AgentSideConnection((client) => {
    switch (adapterType) {
      case "claude":
        agent = new ClaudeAcpAgent(client);
        break;
    }
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
        agent.closeAllSessions();
      }

      // Then close the streams to properly terminate the ACP connection
      // This signals the connection to close and cleanup
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
