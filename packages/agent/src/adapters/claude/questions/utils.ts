import type { ToolCallContent, ToolKind } from "@agentclientprotocol/sdk";
import type { PermissionOption } from "../permissions/permission-options.js";
import {
  type QuestionItem,
  type QuestionMeta,
  QuestionMetaSchema,
  type QuestionOption,
} from "../tool-meta.js";

export { QuestionMetaSchema };
export type { QuestionItem, QuestionMeta, QuestionOption };

export const OPTION_PREFIX = "option_";

export interface AskUserQuestionInput {
  questions?: QuestionItem[];
  question?: string;
  header?: string;
  options?: QuestionOption[];
  multiSelect?: boolean;
}

export function normalizeAskUserQuestionInput(
  input: AskUserQuestionInput,
): QuestionItem[] | null {
  if (input.questions && input.questions.length > 0) {
    return input.questions;
  }

  if (input.question) {
    return [
      {
        question: input.question,
        header: input.header,
        options: input.options || [],
        multiSelect: input.multiSelect,
      },
    ];
  }

  return null;
}

interface QuestionToolCallData {
  toolCallId: string;
  title: string;
  kind: ToolKind;
  content: ToolCallContent[];
  _meta: {
    twigToolKind: "question";
    questions: QuestionItem[];
  };
}

export function buildQuestionToolCallData(
  questions: QuestionItem[],
): QuestionToolCallData {
  return {
    toolCallId: `question-${Date.now()}`,
    title: questions[0]?.question ?? "Question",
    kind: "other",
    content: [],
    _meta: {
      twigToolKind: "question",
      questions,
    },
  };
}

export function buildQuestionOptions(
  question: QuestionItem,
): PermissionOption[] {
  return question.options.map((opt, idx) => ({
    kind: "allow_once" as const,
    name: opt.label,
    optionId: `${OPTION_PREFIX}${idx}`,
    _meta: opt.description ? { description: opt.description } : undefined,
  }));
}
