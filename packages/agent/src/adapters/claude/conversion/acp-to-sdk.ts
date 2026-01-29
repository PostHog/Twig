import type { PromptRequest } from "@agentclientprotocol/sdk";
import type { SDKUserMessage } from "@anthropic-ai/claude-agent-sdk";
import type { ContentBlockParam } from "@anthropic-ai/sdk/resources";

type ImageMimeType = "image/jpeg" | "image/png" | "image/gif" | "image/webp";

function sdkText(value: string): ContentBlockParam {
  return { type: "text", text: value };
}

function formatUriAsLink(uri: string): string {
  try {
    if (uri.startsWith("file://")) {
      const filePath = uri.slice(7);
      const name = filePath.split("/").pop() || filePath;
      return `[@${name}](${uri})`;
    }
    if (uri.startsWith("zed://")) {
      const parts = uri.split("/");
      const name = parts[parts.length - 1] || uri;
      return `[@${name}](${uri})`;
    }
    return uri;
  } catch {
    return uri;
  }
}

function transformMcpCommand(text: string): string {
  const mcpMatch = text.match(/^\/mcp:([^:\s]+):(\S+)(\s+.*)?$/);
  if (mcpMatch) {
    const [, server, command, args] = mcpMatch;
    return `/${server}:${command} (MCP)${args || ""}`;
  }
  return text;
}

function processPromptChunk(
  chunk: PromptRequest["prompt"][number],
  content: ContentBlockParam[],
  context: ContentBlockParam[],
): void {
  switch (chunk.type) {
    case "text":
      content.push(sdkText(transformMcpCommand(chunk.text)));
      break;

    case "resource_link":
      content.push(sdkText(formatUriAsLink(chunk.uri)));
      break;

    case "resource":
      if ("text" in chunk.resource) {
        content.push(sdkText(formatUriAsLink(chunk.resource.uri)));
        context.push(
          sdkText(
            `\n<context ref="${chunk.resource.uri}">\n${chunk.resource.text}\n</context>`,
          ),
        );
      }
      break;

    case "image":
      if (chunk.data) {
        content.push({
          type: "image",
          source: {
            type: "base64",
            data: chunk.data,
            media_type: chunk.mimeType as ImageMimeType,
          },
        });
      } else if (chunk.uri?.startsWith("http")) {
        content.push({
          type: "image",
          source: { type: "url", url: chunk.uri },
        });
      }
      break;

    default:
      break;
  }
}

export function promptToClaude(prompt: PromptRequest): SDKUserMessage {
  const content: ContentBlockParam[] = [];
  const context: ContentBlockParam[] = [];

  for (const chunk of prompt.prompt) {
    processPromptChunk(chunk, content, context);
  }

  content.push(...context);

  return {
    type: "user",
    message: { role: "user", content },
    session_id: prompt.sessionId,
    parent_tool_use_id: null,
  };
}
