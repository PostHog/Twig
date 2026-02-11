import { EnvelopeSimple, Plus } from "@phosphor-icons/react";
import { SidebarItem } from "../SidebarItem";

interface NewTaskItemProps {
  isActive: boolean;
  onClick: () => void;
}

export function NewTaskItem({ isActive, onClick }: NewTaskItemProps) {
  return (
    <SidebarItem
      depth={0}
      icon={<Plus size={16} weight={isActive ? "bold" : "regular"} />}
      label="New task"
      isActive={isActive}
      onClick={onClick}
    />
  );
}

interface InboxItemProps {
  isActive: boolean;
  onClick: () => void;
  signalCount?: number;
}

function formatSignalCount(count: number): string {
  if (count > 99) return "99+";
  return String(count);
}

export function InboxItem({ isActive, onClick, signalCount }: InboxItemProps) {
  return (
    <SidebarItem
      depth={0}
      icon={<EnvelopeSimple size={16} weight={isActive ? "fill" : "regular"} />}
      label="Inbox"
      isActive={isActive}
      onClick={onClick}
      endContent={
        signalCount && signalCount > 0 ? (
          <span
            className="inline-flex min-w-[16px] items-center justify-center rounded-full bg-red-9 px-1 text-[10px] text-white leading-none"
            style={{ height: "16px" }}
            title={`${signalCount} signals`}
          >
            {formatSignalCount(signalCount)}
          </span>
        ) : undefined
      }
    />
  );
}
