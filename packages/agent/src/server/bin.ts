#!/usr/bin/env node
import { Command } from "commander";
import { AgentServer } from "./agent-server.js";
import type { AgentServerConfig } from "./types.js";

const program = new Command();

program
  .name("agent-server")
  .description("PostHog cloud agent server - runs in sandbox environments")
  .requiredOption("--taskId <id>", "Task ID")
  .requiredOption("--runId <id>", "Run ID")
  .requiredOption("--repositoryPath <path>", "Path to the repository")
  .option("--initialPrompt <text>", "Base64-encoded initial prompt")
  .action(async (options) => {
    const apiUrl = process.env.POSTHOG_API_URL;
    const apiKey = process.env.POSTHOG_PERSONAL_API_KEY;
    const projectId = process.env.POSTHOG_PROJECT_ID;

    if (!apiUrl) {
      program.error("Missing required environment variable: POSTHOG_API_URL");
      return;
    }

    if (!apiKey) {
      program.error(
        "Missing required environment variable: POSTHOG_PERSONAL_API_KEY",
      );
      return;
    }

    if (!projectId) {
      program.error(
        "Missing required environment variable: POSTHOG_PROJECT_ID",
      );
      return;
    }

    let decodedPrompt: string | undefined;
    if (options.initialPrompt) {
      try {
        decodedPrompt = Buffer.from(options.initialPrompt, "base64").toString(
          "utf-8",
        );
      } catch {
        program.error("Failed to decode initialPrompt (expected base64)");
        return;
      }
    }

    const config: AgentServerConfig = {
      apiUrl,
      apiKey,
      projectId: parseInt(projectId, 10),
      taskId: options.taskId,
      runId: options.runId,
      repositoryPath: options.repositoryPath,
      initialPrompt: decodedPrompt,
    };

    const server = new AgentServer(config);

    process.on("SIGINT", async () => {
      await server.stop();
      process.exit(0);
    });

    process.on("SIGTERM", async () => {
      await server.stop();
      process.exit(0);
    });

    await server.start();
  });

program.parse();
