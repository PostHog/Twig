import { Tooltip } from "@components/ui/Tooltip";
import { CaretDownIcon, CaretRightIcon, Plus } from "@phosphor-icons/react";
import * as Collapsible from "@radix-ui/react-collapsible";
import { useState } from "react";

interface SidebarSectionProps {
  id: string;
  label: string;
  icon?: React.ReactNode;
  isExpanded: boolean;
  onToggle: () => void;
  children: React.ReactNode;
  addSpacingBefore?: boolean;
  onContextMenu?: (e: React.MouseEvent) => void;
  tooltipContent?: string;
  onNewTask?: () => void;
  newTaskTooltip?: string;
}

export function SidebarSection({
  label,
  icon,
  isExpanded,
  onToggle,
  children,
  addSpacingBefore,
  onContextMenu,
  tooltipContent,
  onNewTask,
  newTaskTooltip,
}: SidebarSectionProps) {
  const [isHovered, setIsHovered] = useState(false);

  return (
    <Collapsible.Root open={isExpanded} onOpenChange={onToggle}>
      <Collapsible.Trigger asChild>
        <button
          type="button"
          className="flex w-full cursor-pointer items-center justify-between border-0 bg-transparent px-2 py-1 text-left font-mono text-[12px] text-gray-11 transition-colors hover:bg-gray-3"
          style={{
            marginTop: addSpacingBefore ? "12px" : undefined,
            paddingLeft: "8px",
          }}
          onContextMenu={onContextMenu}
          onMouseEnter={() => setIsHovered(true)}
          onMouseLeave={() => setIsHovered(false)}
        >
          <span
            className="flex min-w-0 flex-1 items-center"
            style={{ gap: "4px" }}
          >
            {icon && (
              <span className="flex h-[18px] w-[18px] shrink-0 items-center justify-center text-gray-10">
                {isHovered ? (
                  isExpanded ? (
                    <CaretDownIcon size={12} />
                  ) : (
                    <CaretRightIcon size={12} />
                  )
                ) : (
                  icon
                )}
              </span>
            )}
            {tooltipContent ? (
              <Tooltip content={tooltipContent} side="right">
                <span className="overflow-hidden text-ellipsis whitespace-nowrap font-medium">
                  {label}
                </span>
              </Tooltip>
            ) : (
              <span className="overflow-hidden text-ellipsis whitespace-nowrap font-medium">
                {label}
              </span>
            )}
          </span>
          <span className="flex shrink-0 items-center gap-1 text-gray-10">
            {onNewTask && isHovered && (
              <Tooltip content={newTaskTooltip ?? "Start new task"} side="left">
                {/* biome-ignore lint/a11y/useSemanticElements: Cannot use button inside parent button (Collapsible.Trigger) */}
                <span
                  role="button"
                  tabIndex={0}
                  className="flex h-[18px] w-[18px] items-center justify-center rounded-sm border-0 bg-transparent p-0 hover:bg-gray-3"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    onNewTask();
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      e.stopPropagation();
                      onNewTask();
                    }
                  }}
                >
                  <Plus size={12} />
                </span>
              </Tooltip>
            )}
          </span>
        </button>
      </Collapsible.Trigger>
      <Collapsible.Content>{children}</Collapsible.Content>
    </Collapsible.Root>
  );
}
