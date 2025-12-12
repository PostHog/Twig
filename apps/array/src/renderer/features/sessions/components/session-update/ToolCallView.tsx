import { DotsCircleSpinner } from "@components/DotsCircleSpinner";
import type { ToolCall, ToolKind } from "@features/sessions/types";
import {
  ArrowsClockwise,
  ArrowsLeftRight,
  Brain,
  FileText,
  Globe,
  type Icon,
  MagnifyingGlass,
  PencilSimple,
  Terminal,
  Trash,
  Wrench,
} from "@phosphor-icons/react";
import { Code, Flex, Text } from "@radix-ui/themes";

const fontStyle = {
  fontSize: "var(--font-size-1-5)",
  lineHeight: "var(--line-height-1-5)",
};

const kindIcons: Record<ToolKind, Icon> = {
  read: FileText,
  edit: PencilSimple,
  delete: Trash,
  move: ArrowsLeftRight,
  search: MagnifyingGlass,
  execute: Terminal,
  think: Brain,
  fetch: Globe,
  switch_mode: ArrowsClockwise,
  other: Wrench,
};

interface ToolCallViewProps {
  toolCall: ToolCall;
  turnCancelled?: boolean;
}

export function ToolCallView({ toolCall, turnCancelled }: ToolCallViewProps) {
  const { title, kind, status } = toolCall;
  const isIncomplete = status === "pending" || status === "in_progress";
  const isLoading = isIncomplete && !turnCancelled;
  const isFailed = status === "failed";
  const wasCancelled = isIncomplete && turnCancelled;
  const KindIcon = kind ? kindIcons[kind] : Wrench;

  return (
    <Flex align="center" gap="2" className="rounded px-2 py-1">
      {isLoading ? (
        <DotsCircleSpinner size={12} className="text-gray-9" />
      ) : (
        <KindIcon size={12} className="text-gray-9" />
      )}
      <Code size="1" color="gray" style={fontStyle}>
        {title}
      </Code>
      {isFailed && (
        <Text size="1" color="gray" style={fontStyle}>
          (Failed)
        </Text>
      )}
      {wasCancelled && (
        <Text size="1" color="gray" style={fontStyle}>
          (Cancelled)
        </Text>
      )}
    </Flex>
  );
}
