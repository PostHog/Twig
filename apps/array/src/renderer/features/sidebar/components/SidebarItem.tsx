import type { SidebarItemAction } from "../types";

const INDENT_SIZE = 12;

interface SidebarItemProps {
  depth: number;
  icon?: React.ReactNode;
  label: string;
  subtitle?: React.ReactNode;
  isActive?: boolean;
  onClick?: () => void;
  onContextMenu?: (e: React.MouseEvent) => void;
  action?: SidebarItemAction;
  endContent?: React.ReactNode;
}

export function SidebarItem({
  depth,
  icon,
  label,
  subtitle,
  isActive,
  onClick,
  onContextMenu,
  endContent,
}: SidebarItemProps) {
  return (
    <button
      type="button"
      className="focus-visible:-outline-offset-2 flex w-full cursor-pointer items-center border-0 bg-transparent px-2 py-1 text-left font-mono text-[12px] text-gray-11 transition-colors hover:bg-gray-3 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent-8 data-[active]:bg-gray-3"
      data-active={isActive || undefined}
      style={{
        paddingLeft: `${depth * INDENT_SIZE + 8}px`,
        gap: "6px",
      }}
      onClick={onClick}
      onContextMenu={onContextMenu}
    >
      {icon && <span className="flex shrink-0 items-center">{icon}</span>}
      <span className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <span className="overflow-hidden text-ellipsis whitespace-nowrap">
          {label}
        </span>
        {subtitle && (
          <span className="overflow-hidden text-ellipsis whitespace-nowrap text-[10px] text-gray-10">
            {subtitle}
          </span>
        )}
      </span>
      {endContent}
    </button>
  );
}
