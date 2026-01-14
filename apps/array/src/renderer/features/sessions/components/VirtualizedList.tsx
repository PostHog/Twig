import { useVirtualizer } from "@tanstack/react-virtual";
import { type ReactNode, useEffect, useRef } from "react";

interface VirtualizedListProps<T> {
  items: T[];
  estimateSize: number;
  renderItem: (item: T, index: number) => ReactNode;
  getItemKey?: (item: T, index: number) => string | number;
  overscan?: number;
  className?: string;
  autoScrollToBottom?: boolean;
  gap?: number;
  footer?: ReactNode;
}

export function VirtualizedList<T>({
  items,
  estimateSize,
  renderItem,
  getItemKey,
  overscan = 5,
  className,
  autoScrollToBottom = false,
  gap = 0,
  footer,
}: VirtualizedListProps<T>) {
  const scrollRef = useRef<HTMLDivElement>(null);

  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement,
    estimateSize: getEstimateSize,
    overscan,
    gap,
    getItemKey: stableGetItemKey,
  });

  useEffect(() => {
    if (autoScrollToBottom && items.length > 0) {
      virtualizer.scrollToIndex(items.length - 1, { align: "end" });
    }
  }, [autoScrollToBottom, items.length, virtualizer]);

  const virtualItems = virtualizer.getVirtualItems();

  return (
    <div
      ref={scrollRef}
      className={`${className} scrollbar-hide`}
      style={{ height: "100%", overflow: "auto" }}
    >
      <div
        style={{
          height: virtualizer.getTotalSize(),
          width: "100%",
          position: "relative",
        }}
      >
        {virtualItems.map((virtualRow) => (
          <div
            key={virtualRow.key}
            ref={virtualizer.measureElement}
            data-index={virtualRow.index}
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              width: "100%",
              transform: `translateY(${virtualRow.start}px)`,
            }}
          >
            {renderItem(items[virtualRow.index], virtualRow.index)}
          </div>
        ))}
      </div>
      {footer}
    </div>
  );
}
