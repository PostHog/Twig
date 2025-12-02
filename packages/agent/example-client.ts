#!/usr/bin/env node

import "dotenv/config";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import * as readline from "node:readline/promises";
import { fileURLToPath } from "node:url";

import {
  type Client,
  ClientSideConnection,
  ndJsonStream,
  PROTOCOL_VERSION,
  type ReadTextFileRequest,
  type ReadTextFileResponse,
  type RequestPermissionRequest,
  type RequestPermissionResponse,
  type SessionNotification,
  type WriteTextFileRequest,
  type WriteTextFileResponse,
} from "@agentclientprotocol/sdk";
import { Agent } from "./src/agent.js";
import { PostHogAPIClient } from "./src/posthog-api.js";
import type { SessionPersistenceConfig } from "./src/session-store.js";
import { Logger } from "./src/utils/logger.js";

// PostHog configuration - set via env vars
const POSTHOG_CONFIG = {
  apiUrl: process.env.POSTHOG_API_URL || "",
  apiKey: process.env.POSTHOG_API_KEY || "",
  projectId: parseInt(process.env.POSTHOG_PROJECT_ID || "0", 10),
};

const logger = new Logger({ debug: true, prefix: "[example-client]" });

// Simple file-based storage for session -> persistence mapping
const SESSION_STORE_PATH = join(
  dirname(fileURLToPath(import.meta.url)),
  ".session-store.json",
);

interface SessionMapping {
  [sessionId: string]: SessionPersistenceConfig;
}

function loadSessionMappings(): SessionMapping {
  if (existsSync(SESSION_STORE_PATH)) {
    return JSON.parse(readFileSync(SESSION_STORE_PATH, "utf-8"));
  }
  return {};
}

function saveSessionMapping(
  sessionId: string,
  config: SessionPersistenceConfig,
): void {
  const mappings = loadSessionMappings();
  mappings[sessionId] = config;
  writeFileSync(SESSION_STORE_PATH, JSON.stringify(mappings, null, 2));
}

class ExampleClient implements Client {
  isReplaying = false;
  replayCount = 0;
  currentSessionId?: string;

  async requestPermission(
    params: RequestPermissionRequest,
  ): Promise<RequestPermissionResponse> {
    console.log(`\n🔐 Permission requested: ${params.toolCall.title}`);

    console.log(`\nOptions:`);
    params.options.forEach((option, index) => {
      console.log(`   ${index + 1}. ${option.name} (${option.kind})`);
    });

    while (true) {
      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
      });

      const answer = await rl.question("\nChoose an option: ");
      const trimmedAnswer = answer.trim();
      rl.close();

      const optionIndex = parseInt(trimmedAnswer, 10) - 1;
      if (optionIndex >= 0 && optionIndex < params.options.length) {
        return {
          outcome: {
            outcome: "selected",
            optionId: params.options[optionIndex].optionId,
          },
        };
      }
      console.log("Invalid option. Please try again.");
    }
  }

  async sessionUpdate(params: SessionNotification): Promise<void> {
    const update = params.update;

    if (this.isReplaying) {
      this.replayCount++;
      this.renderReplayUpdate(update);
      return;
    }

    switch (update.sessionUpdate) {
      case "agent_message_chunk":
        if (update.content.type === "text") {
          process.stdout.write(update.content.text);
        } else {
          console.log(`[${update.content.type}]`);
        }
        break;
      case "user_message_chunk":
        // Skip rendering user messages live - the user already sees what they typed
        break;
      case "tool_call":
        console.log(`\n🔧 ${update.title} (${update.status})`);
        break;
      case "tool_call_update":
        console.log(
          `\n🔧 Tool call \`${update.toolCallId}\` updated: ${update.status}\n`,
        );
        break;
      case "plan":
        console.log(`[${update.sessionUpdate}]`);
        break;
      case "agent_thought_chunk":
        if (update.content.type === "text") {
          process.stdout.write(`💭 ${update.content.text}`);
        }
        break;
      default:
        break;
    }
  }

  renderReplayUpdate(update: SessionNotification["update"]): void {
    const dim = "\x1b[2m";
    const reset = "\x1b[0m";

    switch (update.sessionUpdate) {
      case "agent_message_chunk":
        if (update.content.type === "text") {
          process.stdout.write(`${dim}${update.content.text}${reset}`);
        }
        break;
      case "user_message_chunk":
        if (update.content.type === "text") {
          process.stdout.write(
            `\n${dim}💬 You: ${update.content.text}${reset}\n`,
          );
        }
        break;
      case "tool_call":
        console.log(`${dim}🔧 ${update.title} (${update.status})${reset}`);
        break;
      case "tool_call_update":
        if (update.status === "completed" || update.status === "failed") {
          console.log(`${dim}   └─ ${update.status}${reset}`);
        }
        break;
      case "agent_thought_chunk":
        if (update.content.type === "text") {
          process.stdout.write(`${dim}💭 ${update.content.text}${reset}`);
        }
        break;
      default:
        break;
    }
  }

  async writeTextFile(
    params: WriteTextFileRequest,
  ): Promise<WriteTextFileResponse> {
    console.error(
      "[Client] Write text file called with:",
      JSON.stringify(params, null, 2),
    );

    return {};
  }

  async readTextFile(
    params: ReadTextFileRequest,
  ): Promise<ReadTextFileResponse> {
    console.error(
      "[Client] Read text file called with:",
      JSON.stringify(params, null, 2),
    );

    return {
      content: "Mock file content",
    };
  }

  async extNotification(
    method: string,
    params: Record<string, unknown>,
  ): Promise<void> {
    if (method === "_posthog/sdk_session") {
      const { sessionId, sdkSessionId } = params as {
        sessionId: string;
        sdkSessionId: string;
      };
      // Update the session mapping with the SDK session ID
      const mappings = loadSessionMappings();
      if (mappings[sessionId]) {
        mappings[sessionId].sdkSessionId = sdkSessionId;
        writeFileSync(SESSION_STORE_PATH, JSON.stringify(mappings, null, 2));
        console.log(`   🔗 SDK session ID stored: ${sdkSessionId}`);
      }
    }
  }
}

async function prompt(message: string): Promise<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  const answer = await rl.question(message);
  rl.close();
  return answer.trim();
}

async function main() {
  // Check for session ID argument: npx tsx example-client.ts [sessionId]
  const existingSessionId = process.argv[2];

  // Load existing session mappings
  const sessionMappings = loadSessionMappings();

  // Check if we're reloading an existing session
  let persistence: SessionPersistenceConfig | undefined;

  if (existingSessionId && sessionMappings[existingSessionId]) {
    // Use existing persistence config
    persistence = sessionMappings[existingSessionId];
    console.log(`🔗 Loading existing session: ${existingSessionId}`);
    console.log(`   📋 Task: ${persistence.taskId}`);
    console.log(`   🏃 Run: ${persistence.runId}`);
    if (persistence.sdkSessionId) {
      console.log(
        `   🧠 SDK Session: ${persistence.sdkSessionId} (context will be restored)`,
      );
    }
  } else if (!existingSessionId) {
    // Create new Task/TaskRun for new sessions (only if PostHog is configured)
    if (
      POSTHOG_CONFIG.apiUrl &&
      POSTHOG_CONFIG.apiKey &&
      POSTHOG_CONFIG.projectId
    ) {
      console.log("🔗 Connecting to PostHog...");
      const posthogClient = new PostHogAPIClient(POSTHOG_CONFIG);

      try {
        // Create a task for this session
        const task = await posthogClient.createTask({
          title: `ACP Session ${new Date().toISOString()}`,
          description: "Session created by example-client",
        });
        console.log(`📋 Created task: ${task.id}`);

        // Create a task run
        const taskRun = await posthogClient.createTaskRun(task.id);
        console.log(`🏃 Created task run: ${taskRun.id}`);
        console.log(`📦 Log URL: ${taskRun.log_url}`);

        persistence = {
          taskId: task.id,
          runId: taskRun.id,
          logUrl: taskRun.log_url,
        };
      } catch (error) {
        console.error("❌ Failed to create Task/TaskRun:", error);
        console.log("   Continuing without S3 persistence...\n");
      }
    } else {
      console.log(
        "ℹ️  PostHog not configured (set POSTHOG_API_URL, POSTHOG_API_KEY, POSTHOG_PROJECT_ID)",
      );
      console.log("   Running without persistence...\n");
    }
  } else {
    console.log(`⚠️  Session ${existingSessionId} not found in local store`);
    console.log("   Starting fresh without persistence...\n");
  }

  // Create Agent and get in-process ACP connection
  const agent = new Agent({
    workingDirectory: process.cwd(),
    debug: true,
    onLog: (level, scope, message, data) => {
      logger.log(level, message, data, scope);
    },
    ...(POSTHOG_CONFIG.apiUrl && { posthogApiUrl: POSTHOG_CONFIG.apiUrl }),
    ...(POSTHOG_CONFIG.apiKey && { posthogApiKey: POSTHOG_CONFIG.apiKey }),
    ...(POSTHOG_CONFIG.projectId && {
      posthogProjectId: POSTHOG_CONFIG.projectId,
    }),
  });

  if (!persistence) {
    logger.error("PostHog configuration required for runTaskV2");
    process.exit(1);
  }

  const { clientStreams } = await agent.runTaskV2(
    persistence.taskId,
    persistence.runId,
    { skipGitBranch: true },
  );

  // Create the client connection using the in-memory streams
  const client = new ExampleClient();
  const clientStream = ndJsonStream(
    clientStreams.writable,
    clientStreams.readable,
  );
  const connection = new ClientSideConnection((_agent) => client, clientStream);

  try {
    // Initialize the connection
    const initResult = await connection.initialize({
      protocolVersion: PROTOCOL_VERSION,
      clientCapabilities: {
        fs: {
          readTextFile: true,
          writeTextFile: true,
        },
      },
    });

    console.log(
      `✅ Connected to agent (protocol v${initResult.protocolVersion})`,
    );
    console.log(
      `   Load session supported: ${initResult.agentCapabilities?.loadSession ?? false}`,
    );

    let sessionId: string;

    if (existingSessionId) {
      // Load existing session
      console.log(`\n🔄 Loading session: ${existingSessionId}`);
      console.log(`${"─".repeat(50)}`);
      console.log(`📜 Conversation history:\n`);

      client.isReplaying = true;
      client.replayCount = 0;

      await connection.loadSession({
        sessionId: existingSessionId,
        cwd: process.cwd(),
        mcpServers: [],
        _meta: persistence
          ? { persistence, sdkSessionId: persistence.sdkSessionId }
          : undefined,
      });

      client.isReplaying = false;
      sessionId = existingSessionId;

      console.log(`\n${"─".repeat(50)}`);
      console.log(`✅ Replayed ${client.replayCount} events from history\n`);
    } else {
      // Create a new session
      const sessionResult = await connection.newSession({
        cwd: process.cwd(),
        mcpServers: [],
        _meta: persistence ? { persistence } : undefined,
      });

      sessionId = sessionResult.sessionId;
      console.log(`📝 Created session: ${sessionId}`);
      if (persistence) {
        // Save the mapping so we can reload later
        saveSessionMapping(sessionId, persistence);
        console.log(
          `   📦 S3 persistence enabled (task: ${persistence.taskId})`,
        );
      }
      console.log(
        `   (Run with session ID to reload: npx tsx example-client.ts ${sessionId})\n`,
      );
    }

    // Interactive prompt loop
    while (true) {
      const userInput = await prompt("\n💬 You: ");

      if (
        userInput.toLowerCase() === "/quit" ||
        userInput.toLowerCase() === "/exit"
      ) {
        console.log("\n👋 Goodbye!");
        break;
      }

      if (userInput.toLowerCase() === "/session") {
        console.log(`\n📝 Current session ID: ${sessionId}`);
        console.log(`   Reload with: npx tsx example-client.ts ${sessionId}`);
        continue;
      }

      if (!userInput) {
        continue;
      }

      console.log("");

      const promptResult = await connection.prompt({
        sessionId,
        prompt: [
          {
            type: "text",
            text: userInput,
          },
        ],
      });

      console.log(`\n\n✅ Agent completed with: ${promptResult.stopReason}`);
    }
  } catch (error) {
    console.error("[Client] Error:", error);
  } finally {
    process.exit(0);
  }
}

main().catch(console.error);
