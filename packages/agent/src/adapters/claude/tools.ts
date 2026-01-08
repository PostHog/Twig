import type {
  PlanEntry,
  ToolCallContent,
  ToolCallLocation,
  ToolKind,
} from "@agentclientprotocol/sdk";
import type { HookCallback, HookInput } from "@anthropic-ai/claude-agent-sdk";
import type {
  ToolResultBlockParam,
  WebSearchToolResultBlockParam,
} from "@anthropic-ai/sdk/resources";
import type {
  BetaBashCodeExecutionToolResultBlockParam,
  BetaCodeExecutionToolResultBlockParam,
  BetaRequestMCPToolResultBlockParam,
  BetaTextEditorCodeExecutionToolResultBlockParam,
  BetaToolSearchToolResultBlockParam,
  BetaWebFetchToolResultBlockParam,
  BetaWebSearchToolResultBlockParam,
} from "@anthropic-ai/sdk/resources/beta.mjs";
import { Logger } from "@/utils/logger.js";
import {
  replaceAndCalculateLocation,
  SYSTEM_REMINDER,
  toolNames,
} from "./mcp-server.js";

interface ToolInfo {
  title: string;
  kind: ToolKind;
  content: ToolCallContent[];
  locations?: ToolCallLocation[];
}

interface ToolUpdate {
  title?: string;
  content?: ToolCallContent[];
  locations?: ToolCallLocation[];
}

interface ToolUse {
  name: string;
  input?: unknown;
}

export function toolInfoFromToolUse(
  toolUse: ToolUse,
  cachedFileContent: { [key: string]: string },
  logger: Logger = new Logger({ debug: false, prefix: "[ClaudeTools]" }),
): ToolInfo {
  const name = toolUse.name;
  // Cast input to allow property access - each case handles its expected properties
  const input = toolUse.input as Record<string, unknown> | undefined;

  switch (name) {
    case "Task":
      return {
        title: input?.description ? String(input.description) : "Task",
        kind: "think",
        content: input?.prompt
          ? [
              {
                type: "content",
                content: { type: "text", text: String(input.prompt) },
              },
            ]
          : [],
      };

    case "NotebookRead":
      return {
        title: input?.notebook_path
          ? `Read Notebook ${String(input.notebook_path)}`
          : "Read Notebook",
        kind: "read",
        content: [],
        locations: input?.notebook_path
          ? [{ path: String(input.notebook_path) }]
          : [],
      };

    case "NotebookEdit":
      return {
        title: input?.notebook_path
          ? `Edit Notebook ${String(input.notebook_path)}`
          : "Edit Notebook",
        kind: "edit",
        content: input?.new_source
          ? [
              {
                type: "content",
                content: { type: "text", text: String(input.new_source) },
              },
            ]
          : [],
        locations: input?.notebook_path
          ? [{ path: String(input.notebook_path) }]
          : [],
      };

    case "Bash":
    case toolNames.bash:
      return {
        title: input?.command
          ? `\`${String(input.command).replaceAll("`", "\\`")}\``
          : "Terminal",
        kind: "execute",
        content: input?.description
          ? [
              {
                type: "content",
                content: { type: "text", text: String(input.description) },
              },
            ]
          : [],
      };

    case "BashOutput":
    case toolNames.bashOutput:
      return {
        title: "Tail Logs",
        kind: "execute",
        content: [],
      };

    case "KillShell":
    case toolNames.killShell:
      return {
        title: "Kill Process",
        kind: "execute",
        content: [],
      };

    case toolNames.read: {
      let limit = "";
      const inputLimit = input?.limit as number | undefined;
      const inputOffset = (input?.offset as number | undefined) ?? 0;
      if (inputLimit) {
        limit = ` (${inputOffset + 1} - ${inputOffset + inputLimit})`;
      } else if (inputOffset) {
        limit = ` (from line ${inputOffset + 1})`;
      }
      return {
        title: `Read ${input?.file_path ? String(input.file_path) : "File"}${limit}`,
        kind: "read",
        locations: input?.file_path
          ? [
              {
                path: String(input.file_path),
                line: inputOffset,
              },
            ]
          : [],
        content: [],
      };
    }

    case "Read":
      return {
        title: "Read File",
        kind: "read",
        content: [],
        locations: input?.file_path
          ? [
              {
                path: String(input.file_path),
                line: (input?.offset as number | undefined) ?? 0,
              },
            ]
          : [],
      };

    case "LS":
      return {
        title: `List the ${input?.path ? `\`${String(input.path)}\`` : "current"} directory's contents`,
        kind: "search",
        content: [],
        locations: [],
      };

    case toolNames.edit:
    case "Edit": {
      const path = input?.file_path ? String(input.file_path) : undefined;
      let oldText = input?.old_string ? String(input.old_string) : null;
      let newText = input?.new_string ? String(input.new_string) : "";
      let affectedLines: number[] = [];

      if (path && oldText) {
        try {
          const oldContent = cachedFileContent[path] || "";
          const newContent = replaceAndCalculateLocation(oldContent, [
            {
              oldText,
              newText,
              replaceAll: false,
            },
          ]);
          oldText = oldContent;
          newText = newContent.newContent;
          affectedLines = newContent.lineNumbers;
        } catch (e) {
          logger.error("Failed to edit file", e);
        }
      }
      return {
        title: path ? `Edit \`${path}\`` : "Edit",
        kind: "edit",
        content:
          input && path
            ? [
                {
                  type: "diff",
                  path,
                  oldText,
                  newText,
                },
              ]
            : [],
        locations: path
          ? affectedLines.length > 0
            ? affectedLines.map((line) => ({ line, path }))
            : [{ path }]
          : [],
      };
    }

    case toolNames.write: {
      let contentResult: ToolCallContent[] = [];
      const filePath = input?.file_path ? String(input.file_path) : undefined;
      const contentStr = input?.content ? String(input.content) : undefined;
      if (filePath) {
        contentResult = [
          {
            type: "diff",
            path: filePath,
            oldText: null,
            newText: contentStr ?? "",
          },
        ];
      } else if (contentStr) {
        contentResult = [
          {
            type: "content",
            content: { type: "text", text: contentStr },
          },
        ];
      }
      return {
        title: filePath ? `Write ${filePath}` : "Write",
        kind: "edit",
        content: contentResult,
        locations: filePath ? [{ path: filePath }] : [],
      };
    }

    case "Write": {
      const filePath = input?.file_path ? String(input.file_path) : undefined;
      const contentStr = input?.content ? String(input.content) : "";
      return {
        title: filePath ? `Write ${filePath}` : "Write",
        kind: "edit",
        content: filePath
          ? [
              {
                type: "diff",
                path: filePath,
                oldText: null,
                newText: contentStr,
              },
            ]
          : [],
        locations: filePath ? [{ path: filePath }] : [],
      };
    }

    case "Glob": {
      let label = "Find";
      const pathStr = input?.path ? String(input.path) : undefined;
      if (pathStr) {
        label += ` \`${pathStr}\``;
      }
      if (input?.pattern) {
        label += ` \`${String(input.pattern)}\``;
      }
      return {
        title: label,
        kind: "search",
        content: [],
        locations: pathStr ? [{ path: pathStr }] : [],
      };
    }

    case "Grep": {
      let label = "grep";

      if (input?.["-i"]) {
        label += " -i";
      }
      if (input?.["-n"]) {
        label += " -n";
      }

      if (input?.["-A"] !== undefined) {
        label += ` -A ${input["-A"]}`;
      }
      if (input?.["-B"] !== undefined) {
        label += ` -B ${input["-B"]}`;
      }
      if (input?.["-C"] !== undefined) {
        label += ` -C ${input["-C"]}`;
      }

      if (input?.output_mode) {
        switch (input.output_mode) {
          case "FilesWithMatches":
            label += " -l";
            break;
          case "Count":
            label += " -c";
            break;
          default:
            break;
        }
      }

      if (input?.head_limit !== undefined) {
        label += ` | head -${input.head_limit}`;
      }

      if (input?.glob) {
        label += ` --include="${String(input.glob)}"`;
      }

      if (input?.type) {
        label += ` --type=${String(input.type)}`;
      }

      if (input?.multiline) {
        label += " -P";
      }

      label += ` "${input?.pattern ? String(input.pattern) : ""}"`;

      if (input?.path) {
        label += ` ${String(input.path)}`;
      }

      return {
        title: label,
        kind: "search",
        content: [],
      };
    }

    case "WebFetch":
      return {
        title: input?.url ? `Fetch ${String(input.url)}` : "Fetch",
        kind: "fetch",
        content: input?.prompt
          ? [
              {
                type: "content",
                content: { type: "text", text: String(input.prompt) },
              },
            ]
          : [],
      };

    case "WebSearch": {
      let label = `"${input?.query ? String(input.query) : ""}"`;
      const allowedDomains = input?.allowed_domains as string[] | undefined;
      const blockedDomains = input?.blocked_domains as string[] | undefined;

      if (allowedDomains && allowedDomains.length > 0) {
        label += ` (allowed: ${allowedDomains.join(", ")})`;
      }

      if (blockedDomains && blockedDomains.length > 0) {
        label += ` (blocked: ${blockedDomains.join(", ")})`;
      }

      return {
        title: label,
        kind: "fetch",
        content: [],
      };
    }

    case "TodoWrite":
      return {
        title: Array.isArray(input?.todos)
          ? `Update TODOs: ${input.todos.map((todo: { content?: string }) => todo.content).join(", ")}`
          : "Update TODOs",
        kind: "think",
        content: [],
      };

    case "ExitPlanMode":
      return {
        title: "Ready to code?",
        kind: "switch_mode",
        content: input?.plan
          ? [
              {
                type: "content",
                content: { type: "text", text: String(input.plan) },
              },
            ]
          : [],
      };

    case "AskUserQuestion": {
      const questions = input?.questions as
        | Array<{ question?: string }>
        | undefined;
      return {
        title: questions?.[0]?.question || "Question",
        kind: "ask" as ToolKind,
        content: questions
          ? [
              {
                type: "content",
                content: {
                  type: "text",
                  text: JSON.stringify(questions, null, 2),
                },
              },
            ]
          : [],
      };
    }

    case "Other": {
      let output: string;
      try {
        output = JSON.stringify(input, null, 2);
      } catch {
        output = typeof input === "string" ? input : "{}";
      }
      return {
        title: name || "Unknown Tool",
        kind: "other",
        content: [
          {
            type: "content",
            content: {
              type: "text",
              text: `\`\`\`json\n${output}\`\`\``,
            },
          },
        ],
      };
    }

    default:
      return {
        title: name || "Unknown Tool",
        kind: "other",
        content: [],
      };
  }
}

export function toolUpdateFromToolResult(
  toolResult:
    | ToolResultBlockParam
    | BetaWebSearchToolResultBlockParam
    | BetaWebFetchToolResultBlockParam
    | WebSearchToolResultBlockParam
    | BetaCodeExecutionToolResultBlockParam
    | BetaBashCodeExecutionToolResultBlockParam
    | BetaTextEditorCodeExecutionToolResultBlockParam
    | BetaRequestMCPToolResultBlockParam
    | BetaToolSearchToolResultBlockParam,
  toolUse: ToolUse | undefined,
): ToolUpdate {
  switch (toolUse?.name) {
    case "Read":
    case toolNames.read:
      if (Array.isArray(toolResult.content) && toolResult.content.length > 0) {
        return {
          content: toolResult.content.map((item) => {
            const itemObj = item as { type?: string; text?: string };
            if (itemObj.type === "text") {
              return {
                type: "content" as const,
                content: {
                  type: "text" as const,
                  text: markdownEscape(
                    (itemObj.text ?? "").replace(SYSTEM_REMINDER, ""),
                  ),
                },
              };
            }
            // For non-text content, return as-is with proper typing
            return {
              type: "content" as const,
              content: item as { type: "text"; text: string },
            };
          }),
        };
      } else if (
        typeof toolResult.content === "string" &&
        toolResult.content.length > 0
      ) {
        return {
          content: [
            {
              type: "content",
              content: {
                type: "text",
                text: markdownEscape(
                  toolResult.content.replace(SYSTEM_REMINDER, ""),
                ),
              },
            },
          ],
        };
      }
      return {};

    case toolNames.bash:
    case "edit":
    case "Edit":
    case toolNames.edit:
    case toolNames.write:
    case "Write": {
      if (
        "is_error" in toolResult &&
        toolResult.is_error &&
        toolResult.content &&
        toolResult.content.length > 0
      ) {
        // Only return errors
        return toAcpContentUpdate(toolResult.content, true);
      }
      return {};
    }

    case "ExitPlanMode": {
      return { title: "Exited Plan Mode" };
    }
    case "AskUserQuestion": {
      // The answer is returned in the tool result
      const content = toolResult.content;
      if (Array.isArray(content) && content.length > 0) {
        const firstItem = content[0];
        if (
          typeof firstItem === "object" &&
          firstItem !== null &&
          "text" in firstItem
        ) {
          return {
            title: "Answer received",
            content: [
              {
                type: "content",
                content: { type: "text", text: String(firstItem.text) },
              },
            ],
          };
        }
      }
      return { title: "Question answered" };
    }
    default: {
      return toAcpContentUpdate(
        toolResult.content,
        "is_error" in toolResult ? toolResult.is_error : false,
      );
    }
  }
}

function toAcpContentUpdate(
  content: unknown,
  isError: boolean = false,
): { content?: ToolCallContent[] } {
  if (Array.isArray(content) && content.length > 0) {
    return {
      content: content.map((item) => {
        const itemObj = item as { type?: string; text?: string };
        if (isError && itemObj.type === "text") {
          return {
            type: "content" as const,
            content: {
              type: "text" as const,
              text: `\`\`\`\n${itemObj.text ?? ""}\n\`\`\``,
            },
          };
        }
        return {
          type: "content" as const,
          content: item as { type: "text"; text: string },
        };
      }),
    };
  } else if (typeof content === "string" && content.length > 0) {
    return {
      content: [
        {
          type: "content",
          content: {
            type: "text",
            text: isError ? `\`\`\`\n${content}\n\`\`\`` : content,
          },
        },
      ],
    };
  }
  return {};
}

export type ClaudePlanEntry = {
  content: string;
  status: "pending" | "in_progress" | "completed";
  activeForm: string;
};

export function planEntries(input: { todos: ClaudePlanEntry[] }): PlanEntry[] {
  return input.todos.map((input) => ({
    content: input.content,
    status: input.status,
    priority: "medium",
  }));
}

export function markdownEscape(text: string): string {
  let escapedText = "```";
  for (const [m] of text.matchAll(/^```+/gm)) {
    while (m.length >= escapedText.length) {
      escapedText += "`";
    }
  }
  return `${escapedText}\n${text}${text.endsWith("\n") ? "" : "\n"}${escapedText}`;
}

/* A global variable to store callbacks that should be executed when receiving hooks from Claude Code */
const toolUseCallbacks: {
  [toolUseId: string]: {
    onPostToolUseHook?: (
      toolUseID: string,
      toolInput: unknown,
      toolResponse: unknown,
    ) => Promise<void>;
  };
} = {};

/* Setup callbacks that will be called when receiving hooks from Claude Code */
export const registerHookCallback = (
  toolUseID: string,
  {
    onPostToolUseHook,
  }: {
    onPostToolUseHook?: (
      toolUseID: string,
      toolInput: unknown,
      toolResponse: unknown,
    ) => Promise<void>;
  },
) => {
  toolUseCallbacks[toolUseID] = {
    onPostToolUseHook,
  };
};

/* A callback for Claude Code that is called when receiving a PostToolUse hook */
export const createPostToolUseHook =
  (
    logger: Logger = new Logger({ prefix: "[createPostToolUseHook]" }),
  ): HookCallback =>
  async (
    input: HookInput,
    toolUseID: string | undefined,
  ): Promise<{ continue: boolean }> => {
    if (input.hook_event_name === "PostToolUse" && toolUseID) {
      const onPostToolUseHook = toolUseCallbacks[toolUseID]?.onPostToolUseHook;
      if (onPostToolUseHook) {
        await onPostToolUseHook(
          toolUseID,
          input.tool_input,
          input.tool_response,
        );
        delete toolUseCallbacks[toolUseID]; // Cleanup after execution
      } else {
        logger.error(
          `No onPostToolUseHook found for tool use ID: ${toolUseID}`,
        );
        delete toolUseCallbacks[toolUseID];
      }
    }
    return { continue: true };
  };
