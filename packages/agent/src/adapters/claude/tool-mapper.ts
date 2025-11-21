import { ToolRegistry } from "../../tools/registry.js";
import type { ToolCallEvent, ToolResultEvent } from "../../types.js";

/**
 * Maps Claude tool names to our tool type system.
 * Enriches tool events with metadata for better UI consumption.
 */
export class ClaudeToolMapper {
  private registry = new ToolRegistry();

  /**
   * Enrich a tool call event with tool metadata.
   * Looks up the tool definition and adds it to the event.
   */
  enrichToolCall(event: ToolCallEvent): ToolCallEvent {
    const tool = this.registry.get(event.toolName);
    if (!tool) {
      // Tool not recognized, return as-is
      return event;
    }

    return {
      ...event,
      tool,
      category: tool.category,
    };
  }

  /**
   * Enrich a tool result event with tool metadata.
   * Looks up the tool definition and adds it to the event.
   */
  enrichToolResult(event: ToolResultEvent): ToolResultEvent {
    const tool = this.registry.get(event.toolName);
    if (!tool) {
      // Tool not recognized, return as-is
      return event;
    }

    return {
      ...event,
      tool,
      category: tool.category,
    };
  }
}
