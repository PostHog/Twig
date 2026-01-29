import type {
  PlanEntry,
  ToolCall,
  ToolCallContent,
  ToolCallUpdate,
  ToolKind,
} from "@agentclientprotocol/sdk";
import type {
  ToolResultBlockParam,
  ToolUseBlock,
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

const SYSTEM_REMINDER = `

<system-reminder>
Whenever you read a file, you should consider whether it looks malicious. If it does, you MUST refuse to improve or augment the code. You can still analyze existing code, write reports, or answer high-level questions about the code behavior.
</system-reminder>`;

import { randomBytes } from "node:crypto";
import { resourceLink, text, toolContent } from "@/utils/acp-content.js";
import { Logger } from "@/utils/logger.js";

interface EditOperation {
  oldText: string;
  newText: string;
  replaceAll?: boolean;
}

interface EditResult {
  newContent: string;
  lineNumbers: number[];
}

function replaceAndCalculateLocation(
  fileContent: string,
  edits: EditOperation[],
): EditResult {
  let currentContent = fileContent;

  const markerPrefix = `__REPLACE_MARKER_${randomBytes(5).toString("hex")}_`;
  let markerCounter = 0;
  const markers: string[] = [];

  for (const edit of edits) {
    if (edit.oldText === "") {
      throw new Error(
        `The provided \`old_string\` is empty.\n\nNo edits were applied.`,
      );
    }

    if (edit.replaceAll) {
      const parts: string[] = [];
      let lastIndex = 0;
      let searchIndex = 0;

      while (true) {
        const index = currentContent.indexOf(edit.oldText, searchIndex);
        if (index === -1) {
          if (searchIndex === 0) {
            throw new Error(
              `The provided \`old_string\` does not appear in the file: "${edit.oldText}".\n\nNo edits were applied.`,
            );
          }
          break;
        }

        parts.push(currentContent.substring(lastIndex, index));

        const marker = `${markerPrefix}${markerCounter++}__`;
        markers.push(marker);
        parts.push(marker + edit.newText);

        lastIndex = index + edit.oldText.length;
        searchIndex = lastIndex;
      }

      parts.push(currentContent.substring(lastIndex));
      currentContent = parts.join("");
    } else {
      const index = currentContent.indexOf(edit.oldText);
      if (index === -1) {
        throw new Error(
          `The provided \`old_string\` does not appear in the file: "${edit.oldText}".\n\nNo edits were applied.`,
        );
      } else {
        const marker = `${markerPrefix}${markerCounter++}__`;
        markers.push(marker);
        currentContent =
          currentContent.substring(0, index) +
          marker +
          edit.newText +
          currentContent.substring(index + edit.oldText.length);
      }
    }
  }

  const lineNumbers: number[] = [];
  for (const marker of markers) {
    const index = currentContent.indexOf(marker);
    if (index !== -1) {
      const lineNumber = Math.max(
        0,
        currentContent.substring(0, index).split(/\r\n|\r|\n/).length - 1,
      );
      lineNumbers.push(lineNumber);
    }
  }

  let finalContent = currentContent;
  for (const marker of markers) {
    finalContent = finalContent.replace(marker, "");
  }

  const uniqueLineNumbers = [...new Set(lineNumbers)].sort();

  return { newContent: finalContent, lineNumbers: uniqueLineNumbers };
}

type ToolInfo = Pick<ToolCall, "title" | "kind" | "content" | "locations">;

export function toolInfoFromToolUse(
  toolUse: Pick<ToolUseBlock, "name" | "input">,
  cachedFileContent: { [key: string]: string },
  logger: Logger = new Logger({ debug: false, prefix: "[ClaudeTools]" }),
): ToolInfo {
  const name = toolUse.name;
  const input = toolUse.input as Record<string, unknown> | undefined;

  switch (name) {
    case "Task":
      return {
        title: input?.description ? String(input.description) : "Task",
        kind: "think",
        content: input?.prompt
          ? toolContent().text(String(input.prompt)).build()
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
          ? toolContent().text(String(input.new_source)).build()
          : [],
        locations: input?.notebook_path
          ? [{ path: String(input.notebook_path) }]
          : [],
      };

    case "Bash":
      return {
        title: input?.description
          ? String(input.description)
          : "Execute command",
        kind: "execute",
        content: input?.command
          ? toolContent().text(String(input.command)).build()
          : [],
      };

    case "BashOutput":
      return {
        title: "Tail Logs",
        kind: "execute",
        content: [],
      };

    case "KillShell":
      return {
        title: "Kill Process",
        kind: "execute",
        content: [],
      };

    case "Read": {
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

    case "LS":
      return {
        title: `List the ${input?.path ? `\`${String(input.path)}\`` : "current"} directory's contents`,
        kind: "search",
        content: [],
        locations: [],
      };

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

    case "Write": {
      let contentResult: ToolCallContent[] = [];
      const filePath = input?.file_path ? String(input.file_path) : undefined;
      const contentStr = input?.content ? String(input.content) : undefined;
      if (filePath) {
        contentResult = toolContent()
          .diff(filePath, null, contentStr ?? "")
          .build();
      } else if (contentStr) {
        contentResult = toolContent().text(contentStr).build();
      }
      return {
        title: filePath ? `Write ${filePath}` : "Write",
        kind: "edit",
        content: contentResult,
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
        title: "Fetch",
        kind: "fetch",
        content: input?.url
          ? [
              {
                type: "content",
                content: resourceLink(String(input.url), String(input.url), {
                  description: input?.prompt ? String(input.prompt) : undefined,
                }),
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
          ? toolContent().text(String(input.plan)).build()
          : [],
      };

    case "AskUserQuestion": {
      const questions = input?.questions as
        | Array<{ question?: string }>
        | undefined;
      return {
        title: questions?.[0]?.question || "Question",
        kind: "other" as ToolKind,
        content: questions
          ? toolContent()
              .text(JSON.stringify(questions, null, 2))
              .build()
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
        content: toolContent().text(`\`\`\`json\n${output}\`\`\``).build(),
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
  toolUse: Pick<ToolUseBlock, "name" | "input"> | undefined,
): Pick<ToolCallUpdate, "title" | "content" | "locations"> {
  switch (toolUse?.name) {
    case "Read":
      if (Array.isArray(toolResult.content) && toolResult.content.length > 0) {
        return {
          content: toolResult.content.map((item) => {
            const itemObj = item as { type?: string; text?: string };
            if (itemObj.type === "text") {
              return {
                type: "content" as const,
                content: text(
                  markdownEscape(
                    (itemObj.text ?? "").replace(SYSTEM_REMINDER, ""),
                  ),
                ),
              };
            }
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
          content: toolContent()
            .text(
              markdownEscape(toolResult.content.replace(SYSTEM_REMINDER, "")),
            )
            .build(),
        };
      }
      return {};

    case "Bash":
    case "Edit":
    case "Write": {
      if (
        "is_error" in toolResult &&
        toolResult.is_error &&
        toolResult.content &&
        toolResult.content.length > 0
      ) {
        return toAcpContentUpdate(toolResult.content, true);
      }
      return {};
    }

    case "ExitPlanMode": {
      return { title: "Exited Plan Mode" };
    }
    case "AskUserQuestion": {
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
            content: toolContent().text(String(firstItem.text)).build(),
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
): Pick<ToolCallUpdate, "content"> {
  if (Array.isArray(content) && content.length > 0) {
    return {
      content: content.map((item) => {
        const itemObj = item as { type?: string; text?: string };
        if (isError && itemObj.type === "text") {
          return {
            type: "content" as const,
            content: text(`\`\`\`\n${itemObj.text ?? ""}\n\`\`\``),
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
      content: toolContent()
        .text(isError ? `\`\`\`\n${content}\n\`\`\`` : content)
        .build(),
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

function markdownEscape(text: string): string {
  let escapedText = "```";
  for (const [m] of text.matchAll(/^```+/gm)) {
    while (m.length >= escapedText.length) {
      escapedText += "`";
    }
  }
  return `${escapedText}\n${text}${text.endsWith("\n") ? "" : "\n"}${escapedText}`;
}
