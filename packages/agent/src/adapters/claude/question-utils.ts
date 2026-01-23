export const OPTION_PREFIX = "option_";
export const OTHER_OPTION_ID = "other";

export interface QuestionItem {
  question: string;
  header?: string;
  options: Array<{ label: string; description?: string }>;
  multiSelect?: boolean;
}

export interface AskUserQuestionInput {
  questions?: QuestionItem[];
  question?: string;
  header?: string;
  options?: Array<{ label: string; description?: string }>;
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
