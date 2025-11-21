import { query } from "@anthropic-ai/claude-agent-sdk";
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
    adapter,
    mcpServers,
    emitEvent,
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

      emitEvent({
        type: "artifact",
        ts: Date.now(),
        kind: "research_questions",
        content: existingResearch.questions,
      });

      // In local mode, halt to allow user to answer
      if (!isCloudMode) {
        emitEvent(
          adapter.createStatusEvent("phase_complete", { phase: "research" }),
        );
        return { status: "skipped", halt: true };
      }
    }

    return { status: "skipped" };
  }

  stepLogger.info("Starting research phase", { taskId: task.id });
  emitEvent(adapter.createStatusEvent("phase_start", { phase: "research" }));

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
  for await (const message of response) {
    emitEvent(adapter.createRawSDKEvent(message));
    const transformedEvents = adapter.transform(message);
    for (const event of transformedEvents) {
      emitEvent(event);
    }
    if (message.type === "assistant" && message.message?.content) {
      for (const c of message.message.content) {
        if (c.type === "text" && c.text) {
          jsonContent += c.text;
        }
      }
    }
  }

  if (!jsonContent.trim()) {
    stepLogger.error("No JSON output from research agent", { taskId: task.id });
    emitEvent({
      type: "error",
      ts: Date.now(),
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
    emitEvent({
      type: "error",
      ts: Date.now(),
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

  emitEvent({
    type: "artifact",
    ts: Date.now(),
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

    emitEvent({
      type: "artifact",
      ts: Date.now(),
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
    emitEvent(
      adapter.createStatusEvent("phase_complete", { phase: "research" }),
    );
    return { status: "completed", halt: true };
  }

  // In cloud mode, check if questions need answering
  const researchData = await fileManager.readResearch(task.id);
  if (researchData?.questions && !researchData.answered) {
    // Questions need answering - halt for user input in cloud mode too
    emitEvent(
      adapter.createStatusEvent("phase_complete", { phase: "research" }),
    );
    return { status: "completed", halt: true };
  }

  // No questions or questions already answered - proceed to planning
  emitEvent(adapter.createStatusEvent("phase_complete", { phase: "research" }));
  return { status: "completed" };
};
