import type { AgentSideConnection } from "@agentclientprotocol/sdk";
import type { PermissionUpdate } from "@anthropic-ai/claude-agent-sdk";
import type { Logger } from "@/utils/logger.js";
import {
  getClaudePlansDir,
  getLatestAssistantText,
  isClaudePlanFilePath,
  isPlanReady,
} from "./plan-utils.js";
import {
  type AskUserQuestionInput,
  normalizeAskUserQuestionInput,
  OPTION_PREFIX,
  OTHER_OPTION_ID,
  type QuestionItem,
} from "./question-utils.js";
import { toolInfoFromToolUse } from "./tool-metadata.js";
import type { Session } from "./types.js";

const WRITE_TOOL_NAMES = [
  "mcp__acp__Edit",
  "mcp__acp__Write",
  "Edit",
  "Write",
  "NotebookEdit",
];

function isWriteTool(toolName: string): boolean {
  return WRITE_TOOL_NAMES.includes(toolName);
}

export type ToolPermissionResult =
  | {
      behavior: "allow";
      updatedInput: Record<string, unknown>;
      updatedPermissions?: PermissionUpdate[];
    }
  | {
      behavior: "deny";
      message: string;
      interrupt: boolean;
    };

interface ToolHandlerContext {
  session: Session;
  toolName: string;
  toolInput: Record<string, unknown>;
  toolUseID: string;
  suggestions?: PermissionUpdate[];
  client: AgentSideConnection;
  sessionId: string;
  fileContentCache: { [key: string]: string };
  logger: Logger;
}

interface PermissionResponse {
  outcome?:
    | {
        outcome: "selected";
        optionId: string;
        selectedOptionIds?: string[];
        customInput?: string;
      }
    | {
        outcome: "cancelled";
      };
}

const DECIMAL_RADIX = 10;

async function emitToolDenial(
  context: ToolHandlerContext,
  message: string,
): Promise<void> {
  context.logger.info(`[canUseTool] Tool denied: ${context.toolName}`, {
    message,
  });
  await context.client.sessionUpdate({
    sessionId: context.sessionId,
    update: {
      sessionUpdate: "tool_call_update",
      toolCallId: context.toolUseID,
      status: "failed",
      content: [
        {
          type: "content",
          content: {
            type: "text",
            text: message,
          },
        },
      ],
    },
  });
}

function getPlanFromFile(
  session: Session,
  fileContentCache: { [key: string]: string },
): string | undefined {
  return (
    session.lastPlanContent ||
    (session.lastPlanFilePath
      ? fileContentCache[session.lastPlanFilePath]
      : undefined)
  );
}

function ensurePlanInInput(
  toolInput: Record<string, unknown>,
  fallbackPlan: string | undefined,
): Record<string, unknown> {
  const hasPlan = typeof (toolInput as { plan?: unknown })?.plan === "string";
  if (hasPlan || !fallbackPlan) {
    return toolInput;
  }
  return { ...toolInput, plan: fallbackPlan };
}

function extractPlanText(input: Record<string, unknown>): string | undefined {
  const plan = (input as { plan?: unknown })?.plan;
  return typeof plan === "string" ? plan : undefined;
}

async function createPlanValidationError(
  message: string,
  context: ToolHandlerContext,
): Promise<ToolPermissionResult> {
  await emitToolDenial(context, message);
  return { behavior: "deny", message, interrupt: false };
}

async function validatePlanContent(
  planText: string | undefined,
  context: ToolHandlerContext,
): Promise<{ valid: true } | { valid: false; error: ToolPermissionResult }> {
  if (!planText) {
    const message = `Plan not ready. Provide the full markdown plan in ExitPlanMode or write it to ${getClaudePlansDir()} before requesting approval.`;
    return {
      valid: false,
      error: await createPlanValidationError(message, context),
    };
  }

  if (!isPlanReady(planText)) {
    const message =
      "Plan not ready. Provide the full markdown plan in ExitPlanMode before requesting approval.";
    return {
      valid: false,
      error: await createPlanValidationError(message, context),
    };
  }

  return { valid: true };
}

async function requestPlanApproval(
  context: ToolHandlerContext,
  updatedInput: Record<string, unknown>,
): Promise<PermissionResponse> {
  const { client, sessionId, toolUseID, fileContentCache } = context;

  return await client.requestPermission({
    options: [
      {
        kind: "allow_always",
        name: "Yes, and auto-accept edits",
        optionId: "acceptEdits",
      },
      {
        kind: "allow_once",
        name: "Yes, and manually approve edits",
        optionId: "default",
      },
      {
        kind: "reject_once",
        name: "No, keep planning",
        optionId: "plan",
      },
    ],
    sessionId,
    toolCall: {
      toolCallId: toolUseID,
      rawInput: { ...updatedInput, toolName: context.toolName },
      title: toolInfoFromToolUse(
        { name: context.toolName, input: updatedInput },
        fileContentCache,
        context.logger,
      ).title,
    },
  });
}

async function applyPlanApproval(
  response: PermissionResponse,
  context: ToolHandlerContext,
  updatedInput: Record<string, unknown>,
): Promise<ToolPermissionResult> {
  const { session, client, sessionId } = context;

  if (
    response.outcome?.outcome === "selected" &&
    (response.outcome.optionId === "default" ||
      response.outcome.optionId === "acceptEdits")
  ) {
    session.permissionMode = response.outcome.optionId;
    await session.query.setPermissionMode(response.outcome.optionId);
    await client.sessionUpdate({
      sessionId,
      update: {
        sessionUpdate: "current_mode_update",
        currentModeId: response.outcome.optionId,
      },
    });

    return {
      behavior: "allow",
      updatedInput,
      updatedPermissions: context.suggestions ?? [
        {
          type: "setMode",
          mode: response.outcome.optionId,
          destination: "session",
        },
      ],
    };
  }

  const message =
    "User wants to continue planning. Please refine your plan based on any feedback provided, or ask clarifying questions if needed.";
  await emitToolDenial(context, message);
  return { behavior: "deny", message, interrupt: false };
}

async function handleExitPlanModeTool(
  context: ToolHandlerContext,
): Promise<ToolPermissionResult> {
  const { session, toolInput, fileContentCache } = context;

  if (session.permissionMode !== "plan") {
    return { behavior: "allow", updatedInput: toolInput };
  }

  const planFromFile = getPlanFromFile(session, fileContentCache);
  const latestText = getLatestAssistantText(session.notificationHistory);
  const fallbackPlan = planFromFile || (latestText ?? undefined);
  const updatedInput = ensurePlanInInput(toolInput, fallbackPlan);
  const planText = extractPlanText(updatedInput);

  const validationResult = await validatePlanContent(planText, context);
  if (!validationResult.valid) {
    return validationResult.error;
  }

  const response = await requestPlanApproval(context, updatedInput);
  return await applyPlanApproval(response, context, updatedInput);
}

function buildQuestionOptions(question: QuestionItem) {
  const options = (question.options || []).map((opt, idx) => ({
    kind: "allow_once" as const,
    name: opt.label,
    optionId: `${OPTION_PREFIX}${idx}`,
    description: opt.description,
  }));

  options.push({
    kind: "allow_once" as const,
    name: "Other",
    optionId: OTHER_OPTION_ID,
    description: "Provide a custom response",
  });

  return options;
}

async function askSingleQuestion(
  question: QuestionItem,
  questionIndex: number,
  totalQuestions: number,
  context: ToolHandlerContext,
) {
  const { client, sessionId, toolUseID, toolInput } = context;
  const options = buildQuestionOptions(question);

  return await client.requestPermission({
    options,
    sessionId,
    toolCall: {
      toolCallId: toolUseID,
      rawInput: {
        ...(toolInput as Record<string, unknown>),
        toolName: context.toolName,
        currentQuestion: question,
        questionIndex,
        totalQuestions,
      },
      title: question.question,
    },
  });
}

function processQuestionResponse(
  response: PermissionResponse,
  question: QuestionItem,
): string | string[] | null {
  if (response.outcome?.outcome !== "selected") {
    return null;
  }

  const selectedOptionId = response.outcome.optionId;

  if (selectedOptionId === OTHER_OPTION_ID && response.outcome.customInput) {
    return response.outcome.customInput;
  }

  if (selectedOptionId === OTHER_OPTION_ID) {
    return OTHER_OPTION_ID;
  }

  if (question.multiSelect && response.outcome.selectedOptionIds) {
    return response.outcome.selectedOptionIds
      .map((id: string) => {
        const idx = parseInt(id.replace(OPTION_PREFIX, ""), DECIMAL_RADIX);
        return question.options?.[idx]?.label;
      })
      .filter(Boolean) as string[];
  }

  const selectedIdx = parseInt(
    selectedOptionId.replace(OPTION_PREFIX, ""),
    DECIMAL_RADIX,
  );
  const selectedOption = question.options?.[selectedIdx];
  return selectedOption?.label || selectedOptionId;
}

async function handleAskUserQuestionTool(
  context: ToolHandlerContext,
): Promise<ToolPermissionResult> {
  const input = context.toolInput as AskUserQuestionInput;
  const questions = normalizeAskUserQuestionInput(input);

  if (!questions) {
    return {
      behavior: "deny",
      message: "No questions provided",
      interrupt: true,
    };
  }

  const allAnswers: Record<string, string | string[]> = {};

  for (let i = 0; i < questions.length; i++) {
    const question = questions[i];
    const response = await askSingleQuestion(
      question,
      i,
      questions.length,
      context,
    );
    const answer = processQuestionResponse(response, question);

    if (answer === null) {
      return {
        behavior: "deny",
        message: "User did not complete all questions",
        interrupt: true,
      };
    }

    allAnswers[question.question] = answer;
  }

  return {
    behavior: "allow",
    updatedInput: {
      ...(context.toolInput as Record<string, unknown>),
      answers: allAnswers,
    },
  };
}

async function handleDefaultPermissionFlow(
  context: ToolHandlerContext,
): Promise<ToolPermissionResult> {
  const {
    toolName,
    toolInput,
    toolUseID,
    client,
    sessionId,
    fileContentCache,
    suggestions,
  } = context;

  const response = await client.requestPermission({
    options: [
      {
        kind: "allow_always",
        name: "Always Allow",
        optionId: "allow_always",
      },
      { kind: "allow_once", name: "Allow", optionId: "allow" },
      { kind: "reject_once", name: "Reject", optionId: "reject" },
    ],
    sessionId,
    toolCall: {
      toolCallId: toolUseID,
      rawInput: toolInput as Record<string, unknown>,
      title: toolInfoFromToolUse(
        { name: toolName, input: toolInput },
        fileContentCache,
        context.logger,
      ).title,
    },
  });

  if (
    response.outcome?.outcome === "selected" &&
    (response.outcome.optionId === "allow" ||
      response.outcome.optionId === "allow_always")
  ) {
    if (response.outcome.optionId === "allow_always") {
      return {
        behavior: "allow",
        updatedInput: toolInput as Record<string, unknown>,
        updatedPermissions: suggestions ?? [
          {
            type: "addRules",
            rules: [{ toolName }],
            behavior: "allow",
            destination: "session",
          },
        ],
      };
    }
    return {
      behavior: "allow",
      updatedInput: toolInput as Record<string, unknown>,
    };
  } else {
    const message = "User refused permission to run tool";
    await emitToolDenial(context, message);
    return {
      behavior: "deny",
      message,
      interrupt: true,
    };
  }
}

function handlePlanFileException(
  context: ToolHandlerContext,
): ToolPermissionResult | null {
  const { session, toolName, toolInput } = context;

  if (session.permissionMode !== "plan" || !isWriteTool(toolName)) {
    return null;
  }

  const filePath = (toolInput as { file_path?: string })?.file_path;
  if (!isClaudePlanFilePath(filePath)) {
    return null;
  }

  session.lastPlanFilePath = filePath;
  const content = (toolInput as { content?: string })?.content;
  if (typeof content === "string") {
    session.lastPlanContent = content;
  }

  return {
    behavior: "allow",
    updatedInput: toolInput as Record<string, unknown>,
  };
}

export async function evaluateToolPermission(
  context: ToolHandlerContext,
): Promise<ToolPermissionResult> {
  const { toolName } = context;

  if (toolName === "ExitPlanMode") {
    return handleExitPlanModeTool(context);
  }

  if (toolName === "AskUserQuestion") {
    return handleAskUserQuestionTool(context);
  }

  const planFileResult = handlePlanFileException(context);
  if (planFileResult) {
    return planFileResult;
  }

  return handleDefaultPermissionFlow(context);
}
