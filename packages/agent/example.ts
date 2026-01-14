#!/usr/bin/env bun

import { execSync } from "node:child_process";
import * as readline from "node:readline";
import { config } from "dotenv";

config();

import { Agent, PermissionMode } from "./src/agent.js";
import { getLlmGatewayUrl } from "./src/utils/gateway.js";

function hasUncommittedChanges(repoPath: string): boolean {
  try {
    const status = execSync("git status --porcelain", {
      cwd: repoPath,
      encoding: "utf-8",
    });
    return status.trim().length > 0;
  } catch {
    return false;
  }
}

async function promptUser(question: string): Promise<boolean> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.toLowerCase() === "y" || answer.toLowerCase() === "yes");
    });
  });
}

const DEFAULT_TASK_DESCRIPTION = `Add a hello world file to the repository.

Create a simple hello.txt file in the root of the repository with the text "Hello, World!".
`;

async function testAgent() {
  let TASK_ID = process.argv[2];

  if (!process.env.POSTHOG_API_KEY) {
    console.error("❌ POSTHOG_API_KEY required");
    process.exit(1);
  }

  if (!process.env.POSTHOG_PROJECT_ID) {
    console.error("❌ POSTHOG_PROJECT_ID required");
    process.exit(1);
  }

  if (!process.env.POSTHOG_API_URL) {
    console.error("❌ POSTHOG_API_URL required");
    process.exit(1);
  }

  const REPO_PATH = process.env.REPO_PATH;

  if (!REPO_PATH) {
    console.error("❌ REPO_PATH required");
    process.exit(1);
  }

  console.log(`📁 Working in: ${REPO_PATH}`);

  // Check for uncommitted changes
  if (hasUncommittedChanges(REPO_PATH)) {
    console.log("⚠️  Warning: There are uncommitted changes in the repository.");
    const proceed = await promptUser(
      "These changes will be discarded. Continue? (y/n): ",
    );
    if (!proceed) {
      console.log("❌ Aborted.");
      process.exit(0);
    }
    console.log("🗑️  Discarding uncommitted changes...");
    execSync("git checkout -- . && git clean -fd", {
      cwd: REPO_PATH,
      encoding: "utf-8",
    });
  }

  const apiKey = process.env.POSTHOG_API_KEY || "";
  const agent = new Agent({
    workingDirectory: REPO_PATH,
    posthogApiUrl: process.env.POSTHOG_API_URL || "http://localhost:8010",
    getPosthogApiKey: () => apiKey,
    posthogProjectId: process.env.POSTHOG_PROJECT_ID
      ? parseInt(process.env.POSTHOG_PROJECT_ID, 10)
      : 1,
    debug: true,
  });

  const posthogApi = agent.getPostHogClient();
  if (!posthogApi) {
    throw new Error("PostHog API client not initialized");
  }

  // Create a new task if no task ID provided
  if (!TASK_ID) {
    console.log("📝 No task ID provided, creating new task...");
    const task = await posthogApi.createTask({
      description: DEFAULT_TASK_DESCRIPTION,
      title: "Hello World Test Task",
    });
    TASK_ID = task.id;
    console.log(`✅ Task created: ${TASK_ID}`);
  }

  console.log(`🎯 Running task: ${TASK_ID}`);
  let poller: ReturnType<typeof setInterval> | undefined;
  try {
    console.log("📝 Creating task run...");
    const taskRun = await posthogApi.createTaskRun(TASK_ID);
    console.log(`✅ Task run created: ${taskRun.id}`);

    // Set up progress polling
    console.log("🔄 Starting progress poller...");
    poller = setInterval(async () => {
      try {
        const updatedRun = await posthogApi.getTaskRun(TASK_ID, taskRun.id);
        console.log(`📊 Progress: ${updatedRun.status}`);
      } catch (err) {
        console.warn("Failed to fetch task progress", err);
      }
    }, 5000);

    // Run task with plan mode
    console.log("🚀 Starting task execution...");
    await agent.runTask(TASK_ID, taskRun.id, {
      repositoryPath: REPO_PATH,
      permissionMode: PermissionMode.ACCEPT_EDITS,
      isCloudMode: false,
      autoProgress: true,
      queryOverrides: {
        env: {
          ...process.env,
          POSTHOG_API_KEY: process.env.POSTHOG_API_KEY,
          POSTHOG_API_HOST: process.env.POSTHOG_API_URL,
          POSTHOG_AUTH_HEADER: `Bearer ${process.env.POSTHOG_API_KEY}`,
          ANTHROPIC_API_KEY: process.env.POSTHOG_API_KEY,
          ANTHROPIC_AUTH_TOKEN: process.env.POSTHOG_API_KEY,
          ANTHROPIC_BASE_URL: getLlmGatewayUrl(
            process.env.POSTHOG_API_URL || "",
          ),
        },
      },
    });

    console.log("✅ Done!");
    console.log(`📁 Plan stored in: .posthog/${TASK_ID}/plan.md`);
  } finally {
    if (poller) {
      clearInterval(poller);
    }
  }
}

testAgent().catch(console.error);
