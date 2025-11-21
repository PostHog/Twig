import type { SDKMessage } from "@anthropic-ai/claude-agent-sdk";
import type { AgentEvent, ArtifactEvent, StatusEvent } from "../../types.js";
import type { ProviderAdapter } from "../types.js";
import { ClaudeToolMapper } from "./tool-mapper.js";

/**
 * Claude provider adapter.
 * Transforms Claude SDK messages into our standardized AgentEvent format.
 */
export class ClaudeAdapter implements ProviderAdapter {
  readonly name = "claude";
  private toolMapper = new ClaudeToolMapper();
  createRawSDKEvent(sdkMessage: any): AgentEvent {
    return {
      type: "raw_sdk_event",
      ts: Date.now(),
      sdkMessage,
    };
  }

  transform(sdkMessage: SDKMessage): AgentEvent[] {
    const baseEvent = { ts: Date.now() };

    if (sdkMessage.type === "stream_event") {
      const event = sdkMessage.event;

      switch (event.type) {
        case "message_start":
          return [
            {
              ...baseEvent,
              type: "message_start",
              messageId: event.message?.id,
              model: event.message?.model,
            },
          ];

        case "content_block_start": {
          const contentBlock = event.content_block;
          if (!contentBlock) return [];

          return [
            {
              ...baseEvent,
              type: "content_block_start",
              index: event.index,
              contentType: contentBlock.type as
                | "text"
                | "tool_use"
                | "thinking",
              toolName:
                contentBlock.type === "tool_use"
                  ? contentBlock.name
                  : undefined,
              toolId:
                contentBlock.type === "tool_use" ? contentBlock.id : undefined,
            },
          ];
        }

        case "content_block_delta": {
          const delta = event.delta;
          if (!delta) return [];

          if (delta.type === "text_delta") {
            return [
              {
                ...baseEvent,
                type: "token",
                content: delta.text,
                contentType: "text",
              },
            ];
          } else if (delta.type === "input_json_delta") {
            return [
              {
                ...baseEvent,
                type: "token",
                content: delta.partial_json,
                contentType: "tool_input",
              },
            ];
          } else if (delta.type === "thinking_delta") {
            return [
              {
                ...baseEvent,
                type: "token",
                content: delta.thinking,
                contentType: "thinking",
              },
            ];
          }
          return [];
        }

        case "content_block_stop":
          return [
            {
              ...baseEvent,
              type: "content_block_stop",
              index: event.index,
            },
          ];

        case "message_delta":
          return [
            {
              ...baseEvent,
              type: "message_delta",
              stopReason: event.delta?.stop_reason,
              stopSequence: event.delta?.stop_sequence,
              usage: event.usage
                ? {
                    outputTokens: event.usage.output_tokens,
                  }
                : undefined,
            },
          ];

        case "message_stop":
          return [
            {
              ...baseEvent,
              type: "message_stop",
            },
          ];

        case "ping":
          // Ignore ping events
          return [];

        case "error":
          return [
            {
              ...baseEvent,
              type: "error",
              message: event.error?.message || "Unknown error",
              error: event.error,
              errorType: event.error?.type || "stream_error",
              context: event.error
                ? {
                    type: event.error.type,
                    code: event.error.code,
                  }
                : undefined,
              sdkError: event.error,
            },
          ];

        default:
          return [];
      }
    }

    // Handle assistant messages (full message, not streaming)
    if (sdkMessage.type === "assistant") {
      const message = sdkMessage.message;
      const events: AgentEvent[] = [];

      // Extract tool calls from content blocks
      // A single assistant message can contain multiple tool_use blocks
      if (message.content && Array.isArray(message.content)) {
        for (const block of message.content) {
          if (block.type === "tool_use") {
            // Create tool_call event and enrich with metadata
            const toolCallEvent = {
              ...baseEvent,
              type: "tool_call" as const,
              toolName: block.name,
              callId: block.id,
              args: block.input || {},
              parentToolUseId: sdkMessage.parent_tool_use_id,
            };
            // Enrich with tool metadata and add to events array
            events.push(this.toolMapper.enrichToolCall(toolCallEvent));
          }
        }
      }

      // If we found tool calls, return them
      if (events.length > 0) {
        return events;
      }

      // If no tool calls, emit status event
      return [
        {
          ...baseEvent,
          type: "status",
          phase: "assistant_message",
          messageId: message.id,
          model: message.model,
        },
      ];
    }

    // Handle user messages
    if (sdkMessage.type === "user") {
      const message = sdkMessage.message;
      const events: AgentEvent[] = [];

      // Check for tool results in content blocks, A single user message can contain multiple tool_result blocks
      if (message?.content && Array.isArray(message.content)) {
        for (const block of message.content) {
          if (block.type === "tool_result") {
            const toolResultEvent = {
              ...baseEvent,
              type: "tool_result" as const,
              toolName: block.tool_name || "unknown",
              callId: block.tool_use_id || "",
              result: block.content,
              isError: block.is_error,
              parentToolUseId: sdkMessage.parent_tool_use_id,
            };
            events.push(this.toolMapper.enrichToolResult(toolResultEvent));
          }
        }
      }

      // If we found tool results, return them
      if (events.length > 0) {
        return events;
      }

      // Otherwise extract text content
      const textContent = this.extractUserContent(message?.content);
      if (!textContent) {
        return [];
      }
      return [
        {
          ...baseEvent,
          type: "user_message",
          content: textContent,
          isSynthetic: sdkMessage.isSynthetic,
        },
      ];
    }

    // Handle result messages
    if (sdkMessage.type === "result") {
      if (sdkMessage.subtype === "success") {
        return [
          {
            ...baseEvent,
            type: "done",
            result: sdkMessage.result,
            durationMs: sdkMessage.duration_ms,
            durationApiMs: sdkMessage.duration_api_ms,
            numTurns: sdkMessage.num_turns,
            totalCostUsd: sdkMessage.total_cost_usd,
            usage: sdkMessage.usage,
            modelUsage: sdkMessage.modelUsage,
            permissionDenials: sdkMessage.permission_denials,
          },
        ];
      } else {
        return [
          {
            ...baseEvent,
            type: "error",
            message: `Execution failed: ${sdkMessage.subtype}`,
            error: { subtype: sdkMessage.subtype },
            errorType: sdkMessage.subtype || "result_error",
            context: {
              subtype: sdkMessage.subtype,
              duration_ms: sdkMessage.duration_ms,
              num_turns: sdkMessage.num_turns,
            },
            sdkError: sdkMessage,
          },
        ];
      }
    }

    // Handle system messages
    if (sdkMessage.type === "system") {
      if (sdkMessage.subtype === "init") {
        return [
          {
            ...baseEvent,
            type: "init",
            model: sdkMessage.model,
            tools: sdkMessage.tools,
            permissionMode: sdkMessage.permissionMode,
            cwd: sdkMessage.cwd,
            apiKeySource: sdkMessage.apiKeySource,
            agents: sdkMessage.agents,
            slashCommands: sdkMessage.slash_commands,
            outputStyle: sdkMessage.output_style,
            mcpServers: sdkMessage.mcp_servers,
          },
        ];
      } else if (sdkMessage.subtype === "compact_boundary") {
        return [
          {
            ...baseEvent,
            type: "compact_boundary",
            trigger: sdkMessage.compact_metadata.trigger,
            preTokens: sdkMessage.compact_metadata.pre_tokens,
          },
        ];
      }
    }

    return [];
  }

  createStatusEvent(phase: string, additionalData?: any): StatusEvent {
    return {
      type: "status",
      ts: Date.now(),
      phase,
      ...additionalData,
    };
  }

  createArtifactEvent(kind: string, content: any): ArtifactEvent {
    return {
      type: "artifact",
      ts: Date.now(),
      kind,
      content,
    };
  }

  private extractUserContent(content: unknown): string | null {
    if (!content) {
      return null;
    }

    if (typeof content === "string") {
      const trimmed = content.trim();
      return trimmed.length > 0 ? trimmed : null;
    }

    if (Array.isArray(content)) {
      const parts: string[] = [];
      for (const block of content) {
        const extracted = this.extractUserContent(block);
        if (extracted) {
          parts.push(extracted);
        } else if (block && typeof block === "object") {
          const candidate = this.extractFromObject(
            block as Record<string, unknown>,
          );
          if (candidate) {
            parts.push(candidate);
          }
        }
      }
      const text = parts.join("\n").trim();
      return text.length > 0 ? text : null;
    }

    if (typeof content === "object") {
      return this.extractFromObject(content as Record<string, unknown>);
    }

    return null;
  }

  private extractFromObject(value: Record<string, unknown>): string | null {
    const preferredKeys = [
      "text",
      "input_text",
      "input",
      "markdown",
      "content",
      "message",
    ];
    for (const key of preferredKeys) {
      if (typeof value[key] === "string") {
        const trimmed = (value[key] as string).trim();
        if (trimmed.length > 0) {
          return trimmed;
        }
      }
    }

    for (const entry of Object.values(value)) {
      const extracted = this.extractUserContent(entry);
      if (extracted) {
        return extracted;
      }
    }

    return null;
  }
}
