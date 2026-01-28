export interface PermissionOption {
  kind: "allow_once" | "allow_always" | "reject_once" | "reject_always";
  name: string;
  optionId: string;
  _meta?: { description?: string; customInput?: boolean };
}

type ToolKind =
  | "execute"
  | "edit"
  | "read"
  | "fetch"
  | "search"
  | "think"
  | "delete"
  | "move"
  | "switch_mode"
  | "other";

type ToolCallContent =
  | { type: "content"; content: { type: "text"; text: string } }
  | {
      type: "content";
      content: {
        type: "resource_link";
        uri: string;
        name: string;
        description?: string;
      };
    }
  | { type: "diff"; path: string; oldText: string | null; newText: string }
  | { type: "terminal"; terminalId: string };

interface ToolCallData {
  toolCallId: string;
  title: string;
  kind: ToolKind;
  content?: ToolCallContent[];
  locations?: { path: string; line?: number }[];
}

export function buildToolCallData(
  toolName: string,
  toolInput: Record<string, unknown>,
): ToolCallData {
  const toolCallId = `story-${Date.now()}`;

  if (isBashTool(toolName)) {
    const command = (toolInput?.command as string) ?? "";
    const description = toolInput?.description as string | undefined;
    return {
      toolCallId,
      title: description ?? "Execute command",
      kind: "execute",
      content: [{ type: "content", content: { type: "text", text: command } }],
    };
  }

  if (isWriteTool(toolName)) {
    const filePath = (toolInput?.file_path as string) ?? "";
    const oldText = (toolInput?.old_string as string) ?? null;
    const newText = (toolInput?.new_string as string) ?? "";
    const content = toolInput?.content as string | undefined;
    return {
      toolCallId,
      title: oldText ? `Edit ${filePath}` : `Write ${filePath}`,
      kind: "edit",
      content: [
        {
          type: "diff",
          path: filePath,
          oldText: oldText,
          newText: content ?? newText,
        },
      ],
      locations: filePath ? [{ path: filePath }] : [],
    };
  }

  if (isReadTool(toolName)) {
    const filePath = (toolInput?.file_path as string) ?? "";
    return {
      toolCallId,
      title: `Read ${filePath}`,
      kind: "read",
      locations: filePath ? [{ path: filePath }] : [],
    };
  }

  if (isSearchTool(toolName)) {
    const pattern = (toolInput?.pattern as string) ?? "";
    return {
      toolCallId,
      title: `grep "${pattern}"`,
      kind: "search",
    };
  }

  if (toolName === "WebFetch") {
    const url = (toolInput?.url as string) ?? "";
    const prompt = toolInput?.prompt as string | undefined;
    return {
      toolCallId,
      title: "Fetch",
      kind: "fetch",
      content: [
        {
          type: "content",
          content: {
            type: "resource_link",
            uri: url,
            name: url,
            description: prompt,
          },
        },
      ],
    };
  }

  if (toolName === "WebSearch") {
    const query = (toolInput?.query as string) ?? "";
    return {
      toolCallId,
      title: "Web search",
      kind: "fetch",
      content: [
        {
          type: "content" as const,
          content: { type: "text" as const, text: query },
        },
      ],
    };
  }

  if (toolName === "Task") {
    const description = (toolInput?.description as string) ?? "Task";
    return {
      toolCallId,
      title: description,
      kind: "think",
    };
  }

  return {
    toolCallId,
    title: toolName,
    kind: "other",
  };
}

export interface QuestionOption {
  label: string;
  description?: string;
}

export interface QuestionItem {
  question: string;
  header?: string;
  options: QuestionOption[];
  multiSelect?: boolean;
  completed?: boolean;
}

interface QuestionToolCallData extends ToolCallData {
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
    optionId: `option_${idx}`,
    _meta: opt.description ? { description: opt.description } : undefined,
  })) as PermissionOption[];
}

const WRITE_TOOL_NAMES = [
  "mcp__acp__Edit",
  "mcp__acp__Write",
  "Edit",
  "Write",
  "NotebookEdit",
];

const BASH_TOOL_NAMES = ["Bash", "mcp__acp__Bash"];

const READ_TOOL_NAMES = ["Read", "mcp__acp__Read", "NotebookRead"];

const SEARCH_TOOL_NAMES = ["Glob", "Grep", "LS"];

export function isWriteTool(toolName: string): boolean {
  return WRITE_TOOL_NAMES.includes(toolName);
}

function isBashTool(toolName: string): boolean {
  return BASH_TOOL_NAMES.includes(toolName);
}

function isReadTool(toolName: string): boolean {
  return READ_TOOL_NAMES.includes(toolName);
}

function isSearchTool(toolName: string): boolean {
  return SEARCH_TOOL_NAMES.includes(toolName);
}

const REJECT_OPTION: PermissionOption = {
  kind: "reject_once",
  name: "No, and tell the agent what to do differently",
  optionId: "reject",
  _meta: { customInput: true },
};

export function buildPermissionOptions(
  toolName: string,
  toolInput: Record<string, unknown>,
  cwd?: string,
): PermissionOption[] {
  if (isBashTool(toolName)) {
    const command = toolInput?.command as string | undefined;
    const cmdName = command?.split(/\s+/)[0] ?? "this command";
    const cwdLabel = cwd ? ` in ${cwd}` : "";
    return [
      { kind: "allow_once", name: "Yes", optionId: "allow" },
      {
        kind: "allow_always",
        name: `Yes, and don't ask again for \`${cmdName}\` commands${cwdLabel}`,
        optionId: "allow_always",
      },
      REJECT_OPTION,
    ];
  }

  if (toolName === "BashOutput" || toolName === "mcp__acp__BashOutput") {
    return [
      { kind: "allow_once", name: "Yes", optionId: "allow" },
      {
        kind: "allow_always",
        name: "Yes, allow all background process reads",
        optionId: "allow_always",
      },
      REJECT_OPTION,
    ];
  }

  if (toolName === "KillShell" || toolName === "mcp__acp__KillShell") {
    return [
      { kind: "allow_once", name: "Yes", optionId: "allow" },
      {
        kind: "allow_always",
        name: "Yes, allow killing processes",
        optionId: "allow_always",
      },
      REJECT_OPTION,
    ];
  }

  if (isWriteTool(toolName)) {
    return [
      { kind: "allow_once", name: "Yes", optionId: "allow" },
      {
        kind: "allow_always",
        name: "Yes, allow all edits during this session",
        optionId: "allow_always",
      },
      REJECT_OPTION,
    ];
  }

  if (isReadTool(toolName)) {
    return [
      { kind: "allow_once", name: "Yes", optionId: "allow" },
      {
        kind: "allow_always",
        name: "Yes, allow all reads during this session",
        optionId: "allow_always",
      },
      REJECT_OPTION,
    ];
  }

  if (isSearchTool(toolName)) {
    return [
      { kind: "allow_once", name: "Yes", optionId: "allow" },
      {
        kind: "allow_always",
        name: "Yes, allow all searches during this session",
        optionId: "allow_always",
      },
      REJECT_OPTION,
    ];
  }

  if (toolName === "WebFetch") {
    const url = toolInput?.url as string | undefined;
    let domain = "";
    try {
      domain = url ? new URL(url).hostname : "";
    } catch {}
    return [
      { kind: "allow_once", name: "Yes", optionId: "allow" },
      {
        kind: "allow_always",
        name: domain
          ? `Yes, allow all fetches from ${domain}`
          : "Yes, allow all fetches",
        optionId: "allow_always",
      },
      REJECT_OPTION,
    ];
  }

  if (toolName === "WebSearch") {
    return [
      { kind: "allow_once", name: "Yes", optionId: "allow" },
      {
        kind: "allow_always",
        name: "Yes, allow all web searches",
        optionId: "allow_always",
      },
      REJECT_OPTION,
    ];
  }

  if (toolName === "Task") {
    return [
      { kind: "allow_once", name: "Yes", optionId: "allow" },
      {
        kind: "allow_always",
        name: "Yes, allow all sub-tasks",
        optionId: "allow_always",
      },
      REJECT_OPTION,
    ];
  }

  if (toolName === "TodoWrite") {
    return [
      { kind: "allow_once", name: "Yes", optionId: "allow" },
      {
        kind: "allow_always",
        name: "Yes, allow all todo updates",
        optionId: "allow_always",
      },
      REJECT_OPTION,
    ];
  }

  return [
    { kind: "allow_once", name: "Yes", optionId: "allow" },
    {
      kind: "allow_always",
      name: "Yes, always allow",
      optionId: "allow_always",
    },
    REJECT_OPTION,
  ];
}
