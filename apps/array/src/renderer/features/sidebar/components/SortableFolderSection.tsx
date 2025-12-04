import { useSortable } from "@dnd-kit/react/sortable";
import { CaretDownIcon, CaretRightIcon } from "@phosphor-icons/react";
import * as Collapsible from "@radix-ui/react-collapsible";
import type { ReactNode } from "react";

interface SortableFolderSectionProps {
  id: string;
  index: number;
  label: string;
  icon: ReactNode;
  isExpanded: boolean;
  onToggle: () => void;
  children: ReactNode;
  onContextMenu?: (e: React.MouseEvent) => void;
}

export function SortableFolderSection({
  id,
  index,
  label,
  icon,
  isExpanded,
  onToggle,
  children,
  onContextMenu,
}: SortableFolderSectionProps) {
  const { ref, handleRef, isDragging } = useSortable({
    id,
    index,
    type: "folder",
    data: { label, icon },
    transition: {
      duration: 200,
      easing: "ease",
    },
  });

  return (
    <div ref={ref} style={{ opacity: isDragging ? 0.5 : 1 }}>
      <Collapsible.Root open={isExpanded} onOpenChange={onToggle}>
        <Collapsible.Trigger asChild>
          <button
            ref={handleRef}
            type="button"
            className="flex w-full cursor-grab items-center justify-between border-0 bg-transparent px-2 py-1 text-left font-mono text-[12px] text-gray-11 transition-colors hover:bg-gray-3"
            style={{ paddingLeft: "8px" }}
            onContextMenu={onContextMenu}
          >
            <span
              className="flex min-w-0 flex-1 items-center"
              style={{ gap: "4px" }}
            >
              {icon && (
                <span className="flex shrink-0 items-center">{icon}</span>
              )}
              <span className="overflow-hidden text-ellipsis whitespace-nowrap font-medium">
                {label}
              </span>
            </span>
            <span className="flex shrink-0 items-center text-gray-10">
              {isExpanded ? (
                <CaretDownIcon size={12} />
              ) : (
                <CaretRightIcon size={12} />
              )}
            </span>
          </button>
        </Collapsible.Trigger>
        <Collapsible.Content>{children}</Collapsible.Content>
      </Collapsible.Root>
    </div>
  );
}
