import { z } from "zod";

const QuestionOptionSchema = z.object({
  label: z.string(),
  description: z.string().optional(),
});

const QuestionItemSchema = z.object({
  question: z.string(),
  header: z.string().optional(),
  options: z.array(QuestionOptionSchema),
  multiSelect: z.boolean().optional(),
  completed: z.boolean().optional(),
});

export const QuestionMetaSchema = z.object({
  questions: z.array(QuestionItemSchema),
});

export type QuestionOption = z.infer<typeof QuestionOptionSchema>;
export type QuestionItem = z.infer<typeof QuestionItemSchema>;
export type QuestionMeta = z.infer<typeof QuestionMetaSchema>;

const toolSchemas = {
  bash: z.object({
    command: z.string(),
    description: z.string().optional(),
  }),
  edit: z.object({
    file_path: z.string(),
    old_string: z.string(),
    new_string: z.string(),
    replace_all: z.boolean().optional(),
  }),
  write: z.object({
    file_path: z.string(),
    content: z.string(),
  }),
  read: z.object({
    file_path: z.string(),
    offset: z.number().optional(),
    limit: z.number().optional(),
  }),
  switch_mode: z.object({
    plan: z.string().optional(),
  }),
} as const;

type ToolKind = keyof typeof toolSchemas;
const _toolKinds = Object.keys(toolSchemas) as ToolKind[];

const sdkToolNameToKind: Record<string, ToolKind> = {
  Bash: "bash",
  Edit: "edit",
  Write: "write",
  Read: "read",
  ExitPlanMode: "switch_mode",
};

const BaseTwigToolMetaSchema = z.object({
  claudeCode: z
    .object({
      toolName: z.string(),
      toolResponse: z.unknown().optional(),
    })
    .optional(),
});

type BaseMeta = z.infer<typeof BaseTwigToolMetaSchema>;

type ToolMeta<K extends ToolKind> = BaseMeta & {
  twigToolKind: K;
} & { [P in K]: z.infer<(typeof toolSchemas)[K]> };

export type BashToolMeta = ToolMeta<"bash">;
export type EditToolMeta = ToolMeta<"edit">;
export type WriteToolMeta = ToolMeta<"write">;
export type ReadToolMeta = ToolMeta<"read">;
export type SwitchModeToolMeta = ToolMeta<"switch_mode">;
export type QuestionToolMeta = BaseMeta & {
  twigToolKind: "question";
  questions: QuestionItem[];
};
export type GenericToolMeta = BaseMeta & { twigToolKind?: undefined };

export type TwigToolMeta =
  | BashToolMeta
  | EditToolMeta
  | WriteToolMeta
  | ReadToolMeta
  | SwitchModeToolMeta
  | QuestionToolMeta
  | GenericToolMeta;

export function isBashToolMeta(meta: TwigToolMeta): meta is BashToolMeta {
  return meta.twigToolKind === "bash";
}

export function isEditToolMeta(meta: TwigToolMeta): meta is EditToolMeta {
  return meta.twigToolKind === "edit";
}

export function isWriteToolMeta(meta: TwigToolMeta): meta is WriteToolMeta {
  return meta.twigToolKind === "write";
}

export function isReadToolMeta(meta: TwigToolMeta): meta is ReadToolMeta {
  return meta.twigToolKind === "read";
}

export function isSwitchModeToolMeta(
  meta: TwigToolMeta,
): meta is SwitchModeToolMeta {
  return meta.twigToolKind === "switch_mode";
}

export function isQuestionToolMeta(
  meta: TwigToolMeta,
): meta is QuestionToolMeta {
  return meta.twigToolKind === "question";
}

export function buildToolMeta(
  toolName: string,
  input: Record<string, unknown>,
): TwigToolMeta {
  const kind = sdkToolNameToKind[toolName];
  if (!kind) {
    return { claudeCode: { toolName } };
  }

  const schema = toolSchemas[kind];
  const result = schema.safeParse(input);
  if (!result.success) {
    return { claudeCode: { toolName } };
  }

  return {
    claudeCode: { toolName },
    twigToolKind: kind,
    [kind]: result.data,
  } as TwigToolMeta;
}
