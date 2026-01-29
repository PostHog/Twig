import type {
  AgentSideConnection,
  RequestPermissionResponse,
} from "@agentclientprotocol/sdk";
import type { PermissionUpdate } from "@anthropic-ai/claude-agent-sdk";
import { text } from "@/utils/acp-content.js";
import type { Logger } from "@/utils/logger.js";
import { toolInfoFromToolUse } from "../conversion/tool-use-to-acp.js";
import {
  getClaudePlansDir,
  getLatestAssistantText,
  isClaudePlanFilePath,
  isPlanReady,
} from "../plan/utils.js";
import {
  type AskUserQuestionInput,
  normalizeAskUserQuestionInput,
  OPTION_PREFIX,
  type QuestionItem,
} from "../questions/utils.js";
import { isToolAllowedForMode, WRITE_TOOLS } from "../tools.js";
import type { Session } from "../types.js";
import {
  buildExitPlanModePermissionOptions,
  buildPermissionOptions,
} from "./permission-options.js";

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
      content: [{ type: "content", content: text(message) }],
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
): Promise<RequestPermissionResponse> {
  const { client, sessionId, toolUseID, fileContentCache } = context;

  const toolInfo = toolInfoFromToolUse(
    { name: context.toolName, input: updatedInput },
    fileContentCache,
    context.logger,
  );

  return await client.requestPermission({
    options: buildExitPlanModePermissionOptions(),
    sessionId,
    toolCall: {
      toolCallId: toolUseID,
      title: toolInfo.title,
      kind: toolInfo.kind,
      content: toolInfo.content,
      locations: toolInfo.locations,
      rawInput: { ...updatedInput, toolName: context.toolName },
    },
  });
}

async function applyPlanApproval(
  response: RequestPermissionResponse,
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
          destination: "localSettings",
        },
      ],
    };
  }

  const message =
    "User wants to continue planning. Please refine your plan based on any feedback provided, or ask clarifying questions if needed.";
  await emitToolDenial(context, message);
  return { behavior: "deny", message, interrupt: false };
}

async function handleEnterPlanModeTool(
  context: ToolHandlerContext,
): Promise<ToolPermissionResult> {
  const { session, client, sessionId, toolInput, logger } = context;

  session.permissionMode = "plan";
  await session.query.setPermissionMode("plan");
  await client.sessionUpdate({
    sessionId,
    update: {
      sessionUpdate: "current_mode_update",
      currentModeId: "plan",
    },
  });

  return {
    behavior: "allow",
    updatedInput: toolInput as Record<string, unknown>,
  };
}

async function handleExitPlanModeTool(
  context: ToolHandlerContext,
): Promise<ToolPermissionResult> {
  const { session, toolInput, fileContentCache } = context;

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
  return (question.options || []).map((opt, idx) => ({
    kind: "allow_once" as const,
    name: opt.label,
    optionId: `${OPTION_PREFIX}${idx}`,
    _meta: opt.description ? { description: opt.description } : undefined,
  }));
}

async function handleAskUserQuestionTool(
  context: ToolHandlerContext,
): Promise<ToolPermissionResult> {
  const input = context.toolInput as AskUserQuestionInput;
  context.logger.info("[AskUserQuestion] Received input", { input });
  const questions = normalizeAskUserQuestionInput(input);
  context.logger.info("[AskUserQuestion] Normalized questions", { questions });

  if (!questions || questions.length === 0) {
    context.logger.warn("[AskUserQuestion] No questions found in input");
    return {
      behavior: "deny",
      message: "No questions provided",
      interrupt: true,
    };
  }

  const { client, sessionId, toolUseID, toolInput, fileContentCache } = context;
  const firstQuestion = questions[0];
  const options = buildQuestionOptions(firstQuestion);

  const toolInfo = toolInfoFromToolUse(
    { name: context.toolName, input: toolInput },
    fileContentCache,
    context.logger,
  );

  const response = await client.requestPermission({
    options,
    sessionId,
    toolCall: {
      toolCallId: toolUseID,
      title: firstQuestion.question,
      kind: "other",
      content: toolInfo.content,
      _meta: {
        twigToolKind: "question",
        questions,
      },
    },
  });

  if (response.outcome?.outcome !== "selected") {
    return {
      behavior: "deny",
      message: "User cancelled the questions",
      interrupt: true,
    };
  }

  const answers = response._meta?.answers as Record<string, string> | undefined;
  if (!answers || Object.keys(answers).length === 0) {
    return {
      behavior: "deny",
      message: "User did not provide answers",
      interrupt: true,
    };
  }

  return {
    behavior: "allow",
    updatedInput: {
      ...(context.toolInput as Record<string, unknown>),
      answers,
    },
  };
}

async function handleDefaultPermissionFlow(
  context: ToolHandlerContext,
): Promise<ToolPermissionResult> {
  const {
    session,
    toolName,
    toolInput,
    toolUseID,
    client,
    sessionId,
    fileContentCache,
    suggestions,
  } = context;

  const toolInfo = toolInfoFromToolUse(
    { name: toolName, input: toolInput },
    fileContentCache,
    context.logger,
  );

  const options = buildPermissionOptions(
    toolName,
    toolInput as Record<string, unknown>,
    session?.cwd,
  );

  const response = await client.requestPermission({
    options,
    sessionId,
    toolCall: {
      toolCallId: toolUseID,
      title: toolInfo.title,
      kind: toolInfo.kind,
      content: toolInfo.content,
      locations: toolInfo.locations,
      rawInput: toolInput as Record<string, unknown>,
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
            destination: "localSettings",
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

  if (session.permissionMode !== "plan" || !WRITE_TOOLS.has(toolName)) {
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

export async function canUseTool(
  context: ToolHandlerContext,
): Promise<ToolPermissionResult> {
  const { toolName, toolInput, session } = context;

  if (isToolAllowedForMode(toolName, session.permissionMode)) {
    return {
      behavior: "allow",
      updatedInput: toolInput as Record<string, unknown>,
    };
  }

  if (toolName === "EnterPlanMode") {
    return handleEnterPlanModeTool(context);
  }

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
