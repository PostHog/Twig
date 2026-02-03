import type { TwigToolKind } from "@features/sessions/types";
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
import { ToolRow } from "./ToolRow";
import { type ToolViewProps, useToolCallStatus } from "./toolCallUtils";

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

export function ToolCallView({
  toolCall,
  turnCancelled,
  turnComplete,
}: ToolViewProps) {
  const { title, kind, status, locations } = toolCall;
  const { isLoading, isFailed, wasCancelled } = useToolCallStatus(
    status,
    turnCancelled,
    turnComplete,
  );
  const KindIcon = (kind && kindIcons[kind]) || Wrench;

  const filePath = kind === "read" && locations?.[0]?.path;
  const displayText = filePath ? `Read ${filePath}` : title;

  return (
    <ToolRow
      icon={KindIcon}
      isLoading={isLoading}
      isFailed={isFailed}
      wasCancelled={wasCancelled}
    >
      {displayText}
    </ToolRow>
  );
}
