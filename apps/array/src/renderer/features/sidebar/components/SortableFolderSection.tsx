import { useSortable } from "@dnd-kit/react/sortable";
import { CaretDownIcon, CaretRightIcon, GearSix } from "@phosphor-icons/react";
import * as Collapsible from "@radix-ui/react-collapsible";
import type { ReactNode } from "react";

interface SortableFolderSectionProps {
  id: string;
  index: number;
  label: string;
  icon: ReactNode;
  isExpanded: boolean;
  onToggle: () => void;
  onSettingsClick?: () => void;
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
  onSettingsClick,
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
        <div className="group flex w-full items-center">
          <Collapsible.Trigger asChild>
            <button
              ref={handleRef}
              type="button"
              className="flex flex-1 cursor-grab items-center justify-between border-0 bg-transparent px-2 py-1.5 text-left font-mono text-[12px] text-gray-11 transition-colors hover:bg-gray-3"
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
              <span className="flex shrink-0 items-center gap-1 text-gray-10">
                {onSettingsClick && (
                  <button
                    type="button"
                    className="flex h-5 w-5 items-center justify-center rounded border-0 bg-transparent p-0 opacity-0 transition-colors hover:bg-gray-4 hover:text-gray-12 group-hover:opacity-100"
                    onClick={(e) => {
                      e.stopPropagation();
                      onSettingsClick();
                    }}
                    title="Repository settings"
                  >
                    <GearSix size={12} />
                  </button>
                )}
                {isExpanded ? (
                  <CaretDownIcon size={12} />
                ) : (
                  <CaretRightIcon size={12} />
                )}
              </span>
            </button>
          </Collapsible.Trigger>
        </div>
        <Collapsible.Content>{children}</Collapsible.Content>
      </Collapsible.Root>
    </div>
  );
}
