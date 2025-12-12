import type { ToolCall } from "@agentclientprotocol/sdk";
import { CaretRight } from "@phosphor-icons/react";
import * as Collapsible from "@radix-ui/react-collapsible";
import { Box, Flex, Text } from "@radix-ui/themes";
import { useState } from "react";

import {
  type RenderItem,
  SessionUpdateView,
} from "./session-update/SessionUpdateView";

interface TurnCollapsibleProps {
  items: RenderItem[];
  toolCalls?: Map<string, ToolCall>;
}

export function TurnCollapsible({ items, toolCalls }: TurnCollapsibleProps) {
  const [isOpen, setIsOpen] = useState(false);

  if (items.length === 0) return null;

  const summary = buildSummary(items);

  return (
    <Collapsible.Root open={isOpen} onOpenChange={setIsOpen}>
      <Collapsible.Trigger asChild>
        <Flex
          align="center"
          gap="2"
          className="cursor-pointer rounded px-2 py-1 hover:bg-gray-3"
        >
          <CaretRight
            size={12}
            className={`text-gray-9 transition-transform ${isOpen ? "rotate-90" : ""}`}
          />
          <Text size="1" color="gray">
            {summary}
          </Text>
        </Flex>
      </Collapsible.Trigger>

      <Collapsible.Content>
        <Box className="mt-2 flex flex-col gap-2 border-gray-6 border-l pl-4">
          {items.map((item, i) =>
            item.sessionUpdate === "console" ? null : (
              <SessionUpdateView
                key={`${item.sessionUpdate}-${i}`}
                item={item}
                toolCalls={toolCalls}
              />
            ),
          )}
        </Box>
      </Collapsible.Content>
    </Collapsible.Root>
  );
}

function buildSummary(items: RenderItem[]): string {
  const counts: Record<string, number> = {};
  for (const item of items) {
    counts[item.sessionUpdate] = (counts[item.sessionUpdate] || 0) + 1;
  }

  const parts: string[] = [];
  const messageCount =
    (counts.agent_message_chunk || 0) + (counts.agent_thought_chunk || 0);
  if (messageCount > 0) {
    parts.push(`${messageCount} message${messageCount > 1 ? "s" : ""}`);
  }
  if (counts.tool_call) {
    parts.push(
      `${counts.tool_call} tool call${counts.tool_call > 1 ? "s" : ""}`,
    );
  }
  if (counts.plan) {
    parts.push(`${counts.plan} plan${counts.plan > 1 ? "s" : ""}`);
  }

  return parts.join(", ") || "collapsed content";
}
