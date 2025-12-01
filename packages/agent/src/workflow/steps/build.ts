import { query } from "@anthropic-ai/claude-agent-sdk";
import { POSTHOG_NOTIFICATIONS } from "../../acp-extensions.js";
import { EXECUTION_SYSTEM_PROMPT } from "../../agents/execution.js";
import { TodoManager } from "../../todo-manager.js";
import { PermissionMode } from "../../types.js";
import type { WorkflowStepRunner } from "../types.js";

export const buildStep: WorkflowStepRunner = async ({ step, context }) => {
  const {
    task,
    cwd,
    options,
    logger,
    promptBuilder,
    sessionId,
    mcpServers,
    gitManager,
    sendNotification,
  } = context;

  const stepLogger = logger.child("BuildStep");

  const latestRun = task.latest_run;
  const prExists =
    latestRun?.output && typeof latestRun.output === "object"
      ? (latestRun.output as Record<string, unknown>).pr_url
      : null;

  if (prExists) {
    stepLogger.info("PR already exists, skipping build phase", {
      taskId: task.id,
    });
    return { status: "skipped" };
  }

  stepLogger.info("Starting build phase", { taskId: task.id });
  await sendNotification(POSTHOG_NOTIFICATIONS.PHASE_START, {
    sessionId,
    phase: "build",
  });

  const executionPrompt = await promptBuilder.buildExecutionPrompt(task, cwd);
  const fullPrompt = `${EXECUTION_SYSTEM_PROMPT}\n\n${executionPrompt}`;

  const configuredPermissionMode =
    options.permissionMode ??
    (typeof step.permissionMode === "string"
      ? (step.permissionMode as PermissionMode)
      : step.permissionMode) ??
    PermissionMode.ACCEPT_EDITS;

  const baseOptions: Record<string, unknown> = {
    model: step.model,
    cwd,
    permissionMode: configuredPermissionMode,
    settingSources: ["local"],
    mcpServers,
    // Allow all tools for build phase - full read/write access needed for implementation
    allowedTools: [
      "Task",
      "Bash",
      "BashOutput",
      "KillBash",
      "Edit",
      "Read",
      "Write",
      "Glob",
      "Grep",
      "NotebookEdit",
      "WebFetch",
      "WebSearch",
      "ListMcpResources",
      "ReadMcpResource",
      "TodoWrite",
    ],
  };

  // Add fine-grained permission hook if provided
  if (options.canUseTool) {
    baseOptions.canUseTool = options.canUseTool;
  }

  const response = query({
    prompt: fullPrompt,
    options: { ...baseOptions, ...(options.queryOverrides || {}) },
  });

  // Track commits made during Claude Code execution
  const commitTracker = await gitManager.trackCommitsDuring();

  // Track todos from TodoWrite tool calls
  const todoManager = new TodoManager(context.fileManager, stepLogger);

  try {
    for await (const message of response) {
      const todoList = await todoManager.checkAndPersistFromMessage(
        message,
        task.id,
      );
      if (todoList) {
        await sendNotification(POSTHOG_NOTIFICATIONS.ARTIFACT, {
          sessionId,
          kind: "todos",
          content: todoList,
        });
      }
    }
  } catch (error) {
    stepLogger.error("Error during build step query", error);
    throw error;
  }

  // Finalize: commit any remaining changes and optionally push
  const { commitCreated, pushedBranch } = await commitTracker.finalize({
    commitMessage: `Implementation for ${task.title}`,
    push: step.push,
  });

  context.stepResults[step.id] = { commitCreated };

  if (!commitCreated) {
    stepLogger.warn("No changes to commit in build phase", { taskId: task.id });
  } else {
    stepLogger.info("Build commits finalized", {
      taskId: task.id,
      pushedBranch,
    });
  }

  await sendNotification(POSTHOG_NOTIFICATIONS.PHASE_COMPLETE, {
    sessionId,
    phase: "build",
  });
  return { status: "completed" };
};
