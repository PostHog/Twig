/**
 * Shared ACP connection factory.
 *
 * Creates ACP connections for the Claude Code agent.
 */

import { AgentSideConnection, ndJsonStream } from "@agentclientprotocol/sdk";
import type { SessionStore } from "@/session-store.js";
import { Logger } from "@/utils/logger.js";
import { createTappedWritableStream } from "@/utils/tapped-stream.js";
import { ClaudeAcpAgent } from "./claude/claude.js";
import { createBidirectionalStreams, type StreamPair } from "./claude/utils.js";

export type AgentFramework = "claude";

export type AcpConnectionConfig = {
  framework?: AgentFramework;
  sessionStore?: SessionStore;
  sessionId?: string;
  taskId?: string;
};

export type InProcessAcpConnection = {
  agentConnection: AgentSideConnection;
  clientStreams: StreamPair;
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

  const { sessionStore, framework = "claude" } = config;

  // Tap both streams for automatic persistence
  // All messages (bidirectional) will be persisted as they flow through
  let agentWritable = streams.agent.writable;
  let clientWritable = streams.client.writable;

  if (config.sessionId && sessionStore) {
    // Register session for persistence BEFORE tapping streams
    // This ensures all messages from the start get persisted
    if (!sessionStore.isRegistered(config.sessionId)) {
      sessionStore.register(config.sessionId, {
        taskId: config.taskId ?? config.sessionId,
        runId: config.sessionId,
        logUrl: "", // Will be updated when we get the real logUrl
      });
    }

    // Tap agent→client stream
    agentWritable = createTappedWritableStream(streams.agent.writable, {
      onMessage: (line) => {
        sessionStore.appendRawLine(config.sessionId!, line);
      },
      logger,
    });

    // Tap client→agent stream
    clientWritable = createTappedWritableStream(streams.client.writable, {
      onMessage: (line) => {
        sessionStore.appendRawLine(config.sessionId!, line);
      },
      logger,
    });
  } else {
    logger.info("Tapped streams NOT enabled", {
      hasSessionId: !!config.sessionId,
      hasSessionStore: !!sessionStore,
    });
  }

  const agentStream = ndJsonStream(agentWritable, streams.agent.readable);

  // Create the Claude agent
  const agentConnection = new AgentSideConnection((client) => {
    logger.info("Creating Claude agent");
    return new ClaudeAcpAgent(client, sessionStore);
  }, agentStream);

  return {
    agentConnection,
    clientStreams: {
      readable: streams.client.readable,
      writable: clientWritable,
    },
  };
}
