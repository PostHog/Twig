import { query } from "@anthropic-ai/claude-agent-sdk";
import { PLANNING_SYSTEM_PROMPT } from "../../agents/planning.js";
import { TodoManager } from "../../todo-manager.js";
import type { WorkflowStepRunner } from "../types.js";
import { finalizeStepGitActions } from "../utils.js";

export const planStep: WorkflowStepRunner = async ({ step, context }) => {
  const {
    task,
    cwd,
    isCloudMode,
    options,
    logger,
    fileManager,
    gitManager,
    promptBuilder,
    adapter,
    mcpServers,
    emitEvent,
  } = context;

  const stepLogger = logger.child("PlanStep");

  const existingPlan = await fileManager.readPlan(task.id);
  if (existingPlan) {
    stepLogger.info("Plan already exists, skipping step", { taskId: task.id });
    return { status: "skipped" };
  }

  const researchData = await fileManager.readResearch(task.id);
  if (researchData?.questions && !researchData.answered) {
    stepLogger.info("Waiting for answered research questions", {
      taskId: task.id,
    });
    emitEvent(
      adapter.createStatusEvent("phase_complete", {
        phase: "research_questions",
      }),
    );
    return { status: "skipped", halt: true };
  }

  stepLogger.info("Starting planning phase", { taskId: task.id });
  emitEvent(adapter.createStatusEvent("phase_start", { phase: "planning" }));
  let researchContext = "";
  if (researchData) {
    researchContext += `## Research Context\n\n${researchData.context}\n\n`;
    if (researchData.keyFiles.length > 0) {
      researchContext += `**Key Files:**\n${researchData.keyFiles.map((f) => `- ${f}`).join("\n")}\n\n`;
    }
    if (researchData.blockers && researchData.blockers.length > 0) {
      researchContext += `**Considerations:**\n${researchData.blockers.map((b) => `- ${b}`).join("\n")}\n\n`;
    }

    // Add answered questions if they exist
    if (
      researchData.questions &&
      researchData.answers &&
      researchData.answered
    ) {
      researchContext += `## Implementation Decisions\n\n`;
      for (const question of researchData.questions) {
        const answer = researchData.answers.find(
          (a) => a.questionId === question.id,
        );

        researchContext += `### ${question.question}\n\n`;
        if (answer) {
          researchContext += `**Selected:** ${answer.selectedOption}\n`;
          if (answer.customInput) {
            researchContext += `**Details:** ${answer.customInput}\n`;
          }
        } else {
          researchContext += `**Selected:** Not answered\n`;
        }
        researchContext += `\n`;
      }
    }
  }

  const planningPrompt = await promptBuilder.buildPlanningPrompt(task, cwd);
  const fullPrompt = `${PLANNING_SYSTEM_PROMPT}\n\n${planningPrompt}\n\n${researchContext}`;

  const baseOptions: Record<string, unknown> = {
    model: step.model,
    cwd,
    permissionMode: "plan",
    settingSources: ["local"],
    mcpServers,
    // Allow research tools: read-only operations, web search, MCP resources, and ExitPlanMode
    allowedTools: [
      "Read",
      "Glob",
      "Grep",
      "WebFetch",
      "WebSearch",
      "ListMcpResources",
      "ReadMcpResource",
      "ExitPlanMode",
      "TodoWrite",
      "BashOutput",
    ],
  };

  const response = query({
    prompt: fullPrompt,
    options: { ...baseOptions, ...(options.queryOverrides || {}) },
  });

  const todoManager = new TodoManager(fileManager, stepLogger);

  let planContent = "";
  try {
    for await (const message of response) {
      emitEvent(adapter.createRawSDKEvent(message));
      const transformedEvents = adapter.transform(message);
      for (const event of transformedEvents) {
        emitEvent(event);
      }

      const todoList = await todoManager.checkAndPersistFromMessage(
        message,
        task.id,
      );
      if (todoList) {
        emitEvent(adapter.createArtifactEvent("todos", todoList));
      }

      // Extract text content for plan
      if (message.type === "assistant" && message.message?.content) {
        for (const block of message.message.content) {
          if (block.type === "text" && block.text) {
            planContent += `${block.text}\n`;
          }
        }
      }
    }
  } catch (error) {
    stepLogger.error("Error during plan step query", error);
    throw error;
  }

  if (planContent.trim()) {
    await fileManager.writePlan(task.id, planContent.trim());
    stepLogger.info("Plan completed", { taskId: task.id });
  }

  await gitManager.addAllPostHogFiles();
  await finalizeStepGitActions(context, step, {
    commitMessage: `Planning phase for ${task.title}`,
  });

  if (!isCloudMode) {
    emitEvent(
      adapter.createStatusEvent("phase_complete", { phase: "planning" }),
    );
    return { status: "completed", halt: true };
  }

  emitEvent(adapter.createStatusEvent("phase_complete", { phase: "planning" }));
  return { status: "completed" };
};
