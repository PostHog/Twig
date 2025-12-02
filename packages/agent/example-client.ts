#!/usr/bin/env node

import { spawn } from "node:child_process";
import { dirname, join } from "node:path";
import * as readline from "node:readline/promises";
import { Readable, Writable } from "node:stream";
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

class ExampleClient implements Client {
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

    switch (update.sessionUpdate) {
      case "agent_message_chunk":
        if (update.content.type === "text") {
          process.stdout.write(update.content.text);
        } else {
          console.log(`[${update.content.type}]`);
        }
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
      case "agent_thought_chunk":
      case "user_message_chunk":
        console.log(`[${update.sessionUpdate}]`);
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
}

async function main() {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = dirname(__filename);
  const agentPath = join(__dirname, "agent.ts");

  // Spawn the agent as a subprocess using tsx
  const agentProcess = spawn("npx", ["tsx", agentPath], {
    stdio: ["pipe", "pipe", "inherit"],
  });

  // Create streams to communicate with the agent
  const input = Writable.toWeb(agentProcess.stdin!);
  const output = Readable.toWeb(
    agentProcess.stdout!,
  ) as unknown as ReadableStream<Uint8Array>;

  // Create the client connection
  const client = new ExampleClient();
  const stream = ndJsonStream(input, output);
  const connection = new ClientSideConnection((_agent) => client, stream);

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

    // Create a new session
    const sessionResult = await connection.newSession({
      cwd: process.cwd(),
      mcpServers: [],
    });

    console.log(`📝 Created session: ${sessionResult.sessionId}`);
    console.log(`💬 User: Hello, agent!\n`);

    // Send a test prompt
    const promptResult = await connection.prompt({
      sessionId: sessionResult.sessionId,
      prompt: [
        {
          type: "text",
          text: "Hello, agent!",
        },
      ],
    });

    console.log(`\n\n✅ Agent completed with: ${promptResult.stopReason}`);
  } catch (error) {
    console.error("[Client] Error:", error);
  } finally {
    agentProcess.kill();
    process.exit(0);
  }
}

main().catch(console.error);
