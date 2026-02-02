#!/usr/bin/env node
import { Command } from "commander";
import { z } from "zod";
import { AgentServer } from "./agent-server.js";

const envSchema = z.object({
  JWT_SECRET: z
    .string()
    .min(1, "JWT_SECRET cannot be empty")
    .optional(), // Only needed for Docker (Modal uses X-Verified-User-Data)
  POSTHOG_API_URL: z
    .string({ required_error: "POSTHOG_API_URL is required for LLM gateway communication" })
    .url("POSTHOG_API_URL must be a valid URL"),
  POSTHOG_PERSONAL_API_KEY: z
    .string({ required_error: "POSTHOG_PERSONAL_API_KEY is required for authenticating with PostHog services" })
    .min(1, "POSTHOG_PERSONAL_API_KEY cannot be empty"),
  POSTHOG_PROJECT_ID: z
    .string({ required_error: "POSTHOG_PROJECT_ID is required for routing requests to the correct project" })
    .regex(/^\d+$/, "POSTHOG_PROJECT_ID must be a numeric string")
    .transform((val) => parseInt(val, 10)),
});

const program = new Command();

program
  .name("agent-server")
  .description("PostHog cloud agent server - runs in sandbox environments")
  .option("--port <port>", "HTTP server port", "3001")
  .requiredOption("--repositoryPath <path>", "Path to the repository")
  .action(async (options) => {
    const envResult = envSchema.safeParse(process.env);

    if (!envResult.success) {
      const errors = envResult.error.issues
        .map((issue) => `  - ${issue.message}`)
        .join("\n");
      program.error(`Environment validation failed:\n${errors}`);
      return;
    }

    const env = envResult.data;

    const server = new AgentServer({
      port: parseInt(options.port, 10),
      jwtSecret: env.JWT_SECRET,
      repositoryPath: options.repositoryPath,
      apiUrl: env.POSTHOG_API_URL,
      apiKey: env.POSTHOG_PERSONAL_API_KEY,
      projectId: env.POSTHOG_PROJECT_ID,
    });

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
