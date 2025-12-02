import { query } from "@anthropic-ai/claude-agent-sdk";
import { POSTHOG_NOTIFICATIONS } from "../../acp-extensions.js";
import { RESEARCH_SYSTEM_PROMPT } from "../../agents/research.js";
import type { ResearchEvaluation } from "../../types.js";
import type { WorkflowStepRunner } from "../types.js";
import { finalizeStepGitActions } from "../utils.js";

export const researchStep: WorkflowStepRunner = async ({ step, context }) => {
  const {
    task,
    cwd,
    isCloudMode,
    options,
    logger,
    fileManager,
    gitManager,
    promptBuilder,
    sessionId,
    mcpServers,
    sendNotification,
  } = context;

  const stepLogger = logger.child("ResearchStep");

  const existingResearch = await fileManager.readResearch(task.id);
  if (existingResearch) {
    stepLogger.info("Research already exists", {
      taskId: task.id,
      hasQuestions: !!existingResearch.questions,
      answered: existingResearch.answered,
    });

    // If there are unanswered questions, re-emit them so UI can prompt user
    if (existingResearch.questions && !existingResearch.answered) {
      stepLogger.info("Re-emitting unanswered research questions", {
        taskId: task.id,
        questionCount: existingResearch.questions.length,
      });

      await sendNotification(POSTHOG_NOTIFICATIONS.ARTIFACT, {
        sessionId,
        kind: "research_questions",
        content: existingResearch.questions,
      });

      // In local mode, halt to allow user to answer
      if (!isCloudMode) {
        await sendNotification(POSTHOG_NOTIFICATIONS.PHASE_COMPLETE, {
          sessionId,
          phase: "research",
        });
        return { status: "skipped", halt: true };
      }
    }

    return { status: "skipped" };
  }

  stepLogger.info("Starting research phase", { taskId: task.id });
  await sendNotification(POSTHOG_NOTIFICATIONS.PHASE_START, {
    sessionId,
    phase: "research",
  });

  const researchPrompt = await promptBuilder.buildResearchPrompt(task, cwd);
  const fullPrompt = `${RESEARCH_SYSTEM_PROMPT}\n\n${researchPrompt}`;

  const baseOptions: Record<string, unknown> = {
    model: step.model,
    cwd,
    permissionMode: "plan",
    settingSources: ["local"],
    mcpServers,
    // Allow research tools: read-only operations, web search, and MCP resources
    allowedTools: [
      "Read",
      "Glob",
      "Grep",
      "WebFetch",
      "WebSearch",
      "ListMcpResources",
      "ReadMcpResource",
      "TodoWrite",
      "BashOutput",
    ],
  };

  const response = query({
    prompt: fullPrompt,
    options: { ...baseOptions, ...(options.queryOverrides || {}) },
  });

  let jsonContent = "";
  try {
    for await (const message of response) {
      // Extract text content from assistant messages
      if (message.type === "assistant" && message.message?.content) {
        for (const c of message.message.content) {
          if (c.type === "text" && c.text) {
            jsonContent += c.text;
          }
        }
      }
    }
  } catch (error) {
    stepLogger.error("Error during research step query", error);
    throw error;
  }

  if (!jsonContent.trim()) {
    stepLogger.error("No JSON output from research agent", { taskId: task.id });
    await sendNotification(POSTHOG_NOTIFICATIONS.ERROR, {
      sessionId,
      message: "Research agent returned no output",
    });
    return { status: "completed", halt: true };
  }

  // Parse JSON response
  let evaluation: ResearchEvaluation;
  try {
    // Extract JSON from potential markdown code blocks or other wrapping
    const jsonMatch = jsonContent.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error("No JSON object found in response");
    }
    evaluation = JSON.parse(jsonMatch[0]);
    stepLogger.info("Parsed research evaluation", {
      taskId: task.id,
      score: evaluation.actionabilityScore,
      hasQuestions: !!evaluation.questions,
    });
  } catch (error) {
    stepLogger.error("Failed to parse research JSON", {
      taskId: task.id,
      error: error instanceof Error ? error.message : String(error),
      content: jsonContent.substring(0, 500),
    });
    await sendNotification(POSTHOG_NOTIFICATIONS.ERROR, {
      sessionId,
      message: `Failed to parse research JSON: ${
        error instanceof Error ? error.message : String(error)
      }`,
    });
    return { status: "completed", halt: true };
  }

  // Add answered/answers fields to evaluation
  if (evaluation.questions && evaluation.questions.length > 0) {
    evaluation.answered = false;
    evaluation.answers = undefined;
  }

  // Always write research.json
  await fileManager.writeResearch(task.id, evaluation);
  stepLogger.info("Research evaluation written", {
    taskId: task.id,
    score: evaluation.actionabilityScore,
    hasQuestions: !!evaluation.questions,
  });

  await sendNotification(POSTHOG_NOTIFICATIONS.ARTIFACT, {
    sessionId,
    kind: "research_evaluation",
    content: evaluation,
  });

  await gitManager.addAllPostHogFiles();
  await finalizeStepGitActions(context, step, {
    commitMessage: `Research phase for ${task.title}`,
  });

  // Log whether questions need answering
  if (
    evaluation.actionabilityScore < 0.7 &&
    evaluation.questions &&
    evaluation.questions.length > 0
  ) {
    stepLogger.info("Actionability score below threshold, questions needed", {
      taskId: task.id,
      score: evaluation.actionabilityScore,
      questionCount: evaluation.questions.length,
    });

    await sendNotification(POSTHOG_NOTIFICATIONS.ARTIFACT, {
      sessionId,
      kind: "research_questions",
      content: evaluation.questions,
    });
  } else {
    stepLogger.info("Actionability score acceptable, proceeding to planning", {
      taskId: task.id,
      score: evaluation.actionabilityScore,
    });
  }

  // In local mode, always halt after research for user review
  if (!isCloudMode) {
    await sendNotification(POSTHOG_NOTIFICATIONS.PHASE_COMPLETE, {
      sessionId,
      phase: "research",
    });
    return { status: "completed", halt: true };
  }

  // In cloud mode, check if questions need answering
  const researchData = await fileManager.readResearch(task.id);
  if (researchData?.questions && !researchData.answered) {
    // Questions need answering - halt for user input in cloud mode too
    await sendNotification(POSTHOG_NOTIFICATIONS.PHASE_COMPLETE, {
      sessionId,
      phase: "research",
    });
    return { status: "completed", halt: true };
  }

  // No questions or questions already answered - proceed to planning
  await sendNotification(POSTHOG_NOTIFICATIONS.PHASE_COMPLETE, {
    sessionId,
    phase: "research",
  });
  return { status: "completed" };
};
