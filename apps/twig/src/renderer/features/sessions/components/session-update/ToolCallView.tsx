import { DotsCircleSpinner } from "@components/DotsCircleSpinner";
import type { ToolCall, TwigToolKind } from "@features/sessions/types";
import {
  ArrowsClockwise,
  ArrowsLeftRight,
  Brain,
  ChatCircle,
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

const kindIcons: Record<TwigToolKind, Icon> = {
  read: FileText,
  edit: PencilSimple,
  delete: Trash,
  move: ArrowsLeftRight,
  search: MagnifyingGlass,
  execute: Terminal,
  think: Brain,
  fetch: Globe,
  switch_mode: ArrowsClockwise,
  question: ChatCircle,
  other: Wrench,
};

interface ToolCallViewProps {
  toolCall: ToolCall;
  turnCancelled?: boolean;
  turnComplete?: boolean;
}

export function ToolCallView({
  toolCall,
  turnCancelled,
  turnComplete,
}: ToolCallViewProps) {
  const { title, kind, status, locations } = toolCall;
  const isIncomplete = status === "pending" || status === "in_progress";
  const isLoading = isIncomplete && !turnCancelled && !turnComplete;
  const isFailed = status === "failed";
  const wasCancelled = isIncomplete && turnCancelled;
  const KindIcon = (kind && kindIcons[kind]) || Wrench;

  // For read tool, show file path from locations if available
  const filePath = kind === "read" && locations?.[0]?.path;
  const displayText = filePath ? `Read ${filePath}` : title;

  return (
    <Flex align="center" gap="2" className="py-0.5 pl-3">
      {isLoading ? (
        <DotsCircleSpinner size={12} className="text-gray-9" />
      ) : (
        <KindIcon size={12} className="text-gray-9" />
      )}
      <Code size="1" color="gray">
        {displayText}
      </Code>
      {isFailed && (
        <Text size="1" color="gray">
          (Failed)
        </Text>
      )}
      {wasCancelled && (
        <Text size="1" color="gray">
          (Cancelled)
        </Text>
      )}
    </Flex>
  );
}
