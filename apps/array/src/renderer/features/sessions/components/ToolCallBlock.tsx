import type { ToolKind } from "@agentclientprotocol/sdk";
import { DotsCircleSpinner } from "@components/DotsCircleSpinner";
import {
  ArrowsClockwise,
  Brain,
  CaretRight,
  FileText,
  Globe,
  type Icon,
  MagnifyingGlass,
  PencilSimple,
  Terminal,
  Trash,
  Wrench,
} from "@phosphor-icons/react";
import * as Collapsible from "@radix-ui/react-collapsible";
import { Box, Code, Flex, Text } from "@radix-ui/themes";
import { useState } from "react";

const fontStyle = {
  fontSize: "var(--font-size-1-5)",
  lineHeight: "var(--line-height-1-5)",
};

const kindIcons: Record<ToolKind, Icon> = {
  read: FileText,
  edit: PencilSimple,
  delete: Trash,
  move: FileText,
  search: MagnifyingGlass,
  execute: Terminal,
  think: Brain,
  fetch: Globe,
  switch_mode: ArrowsClockwise,
  other: Wrench,
};

interface ToolCallBlockProps {
  toolName: string;
  kind?: ToolKind;
  status: "pending" | "running" | "completed" | "error";
  args?: Record<string, unknown>;
  result?: unknown;
}

export function ToolCallBlock({
  toolName,
  kind,
  status,
  args,
  result,
}: ToolCallBlockProps) {
  const [isOpen, setIsOpen] = useState(false);

  const isLoading = status === "pending" || status === "running";
  const isFailed = status === "error";
  const KindIcon = kind ? kindIcons[kind] : null;

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
          {isLoading ? (
            <DotsCircleSpinner size={12} className="text-gray-9" />
          ) : KindIcon ? (
            <KindIcon size={12} className="text-gray-9" />
          ) : (
            <Wrench size={12} className="text-gray-9" />
          )}
          <Code size="1" color="gray" style={fontStyle}>
            {toolName}
          </Code>
          {isFailed && (
            <Text size="1" color="gray" style={fontStyle}>
              (Failed)
            </Text>
          )}
        </Flex>
      </Collapsible.Trigger>

      <Collapsible.Content>
        <Box className="mt-1 ml-6 overflow-hidden rounded bg-gray-2 p-2">
          {args && (
            <Box className="mb-2">
              <Text size="1" color="gray" weight="medium" style={fontStyle}>
                Arguments
              </Text>
              <Code
                size="1"
                className="mt-1 block overflow-x-auto whitespace-pre"
                style={fontStyle}
              >
                {JSON.stringify(args, null, 2)}
              </Code>
            </Box>
          )}
          {result !== undefined && (
            <Box>
              <Text size="1" color="gray" weight="medium" style={fontStyle}>
                Result
              </Text>
              <Code
                size="1"
                className="mt-1 block overflow-x-auto whitespace-pre"
                style={fontStyle}
              >
                {typeof result === "string"
                  ? result
                  : JSON.stringify(result, null, 2)}
              </Code>
            </Box>
          )}
        </Box>
      </Collapsible.Content>
    </Collapsible.Root>
  );
}
