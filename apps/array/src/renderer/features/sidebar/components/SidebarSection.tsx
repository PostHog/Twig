import { CaretDownIcon, CaretRightIcon } from "@phosphor-icons/react";
import * as Collapsible from "@radix-ui/react-collapsible";

interface SidebarSectionProps {
  id: string;
  label: string;
  icon?: React.ReactNode;
  isExpanded: boolean;
  onToggle: () => void;
  children: React.ReactNode;
  addSpacingBefore?: boolean;
  onContextMenu?: (e: React.MouseEvent) => void;
}

export function SidebarSection({
  label,
  icon,
  isExpanded,
  onToggle,
  children,
  addSpacingBefore,
  onContextMenu,
}: SidebarSectionProps) {
  return (
    <Collapsible.Root open={isExpanded} onOpenChange={onToggle}>
      <Collapsible.Trigger asChild>
        <button
          type="button"
          className="flex w-full cursor-pointer items-center justify-between border-0 bg-transparent px-2 py-1 text-left font-mono text-[12px] text-gray-12 transition-colors hover:bg-gray-3"
          style={{
            marginTop: addSpacingBefore ? "16px" : undefined,
          }}
          onContextMenu={onContextMenu}
        >
          <span className="flex flex-1 items-center" style={{ gap: "6px" }}>
            {icon && <span className="flex shrink-0 items-center">{icon}</span>}
            <span className="overflow-hidden text-ellipsis whitespace-nowrap font-medium">
              {label}
            </span>
            <span className="flex items-center">
              {isExpanded ? (
                <CaretDownIcon size={12} weight="fill" />
              ) : (
                <CaretRightIcon size={12} weight="fill" />
              )}
            </span>
          </span>
        </button>
      </Collapsible.Trigger>
      <Collapsible.Content>{children}</Collapsible.Content>
    </Collapsible.Root>
  );
}
