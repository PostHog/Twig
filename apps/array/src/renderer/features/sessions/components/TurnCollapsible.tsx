import { CaretRight } from "@phosphor-icons/react";
import * as Collapsible from "@radix-ui/react-collapsible";
import { Box, Flex, Text } from "@radix-ui/themes";
import { useState } from "react";
import { AgentMessage } from "./AgentMessage";
import { ToolCallBlock } from "./ToolCallBlock";

interface ToolData {
  toolName: string;
  toolCallId: string;
  status: "pending" | "running" | "completed" | "error";
  args?: Record<string, unknown>;
  result?: unknown;
}

interface ParsedMessage {
  id: string;
  type: "user" | "agent" | "tool" | "console";
  content: string;
  toolData?: ToolData;
}

interface TurnCollapsibleProps {
  messages: ParsedMessage[];
}

export function TurnCollapsible({ messages }: TurnCollapsibleProps) {
  const [isOpen, setIsOpen] = useState(false);

  const agentMessageCount = messages.filter((m) => m.type === "agent").length;
  const toolCallCount = messages.filter((m) => m.type === "tool").length;

  const parts: string[] = [];
  if (agentMessageCount > 0) {
    parts.push(
      `${agentMessageCount} message${agentMessageCount > 1 ? "s" : ""}`,
    );
  }
  if (toolCallCount > 0) {
    parts.push(`${toolCallCount} tool call${toolCallCount > 1 ? "s" : ""}`);
  }
  const summary = parts.join(", ");

  if (messages.length === 0) return null;

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
          {messages.map((message) => {
            switch (message.type) {
              case "agent":
                return (
                  <AgentMessage key={message.id} content={message.content} />
                );
              case "tool":
                return message.toolData ? (
                  <ToolCallBlock
                    key={message.id}
                    toolName={message.toolData.toolName}
                    status={message.toolData.status}
                    args={message.toolData.args}
                    result={message.toolData.result}
                  />
                ) : null;
              default:
                return null;
            }
          })}
        </Box>
      </Collapsible.Content>
    </Collapsible.Root>
  );
}
