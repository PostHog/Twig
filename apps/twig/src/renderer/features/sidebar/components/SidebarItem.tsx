import type { SidebarItemAction } from "../types";

const INDENT_SIZE = 8;

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
      className="group focus-visible:-outline-offset-2 flex w-full cursor-pointer items-start bg-transparent px-2 py-1.5 text-left font-mono text-[12px] text-gray-11 transition-colors hover:bg-gray-3 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent-8 data-[active]:bg-accent-4 data-[active]:text-gray-12"
      data-active={isActive || undefined}
      style={{
        paddingLeft: `${depth * INDENT_SIZE + 8 + (depth > 0 ? 4 : 0)}px`,
        gap: "4px",
      }}
      onClick={onClick}
      onContextMenu={onContextMenu}
    >
      {icon && (
        <span
          className="flex shrink-0 items-center text-gray-10 group-data-[active]:text-gray-11"
          style={{
            height: "18px",
            width: "18px",
            justifyContent: "center",
          }}
        >
          {icon}
        </span>
      )}
      <span className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <span className="flex items-center gap-1" style={{ height: "18px" }}>
          <span className="min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap text-gray-12">
            {label}
          </span>
          {endContent}
        </span>
        {subtitle && (
          <span className="overflow-hidden text-ellipsis whitespace-nowrap text-[10px] text-gray-10 group-data-[active]:text-gray-11">
            {subtitle}
          </span>
        )}
      </span>
    </button>
  );
}
