import { useVirtualizer } from "@tanstack/react-virtual";
import { type ReactNode, useEffect, useLayoutEffect, useRef } from "react";

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
  const isAtBottomRef = useRef(true);
  const isInitialMountRef = useRef(true);

  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => estimateSize,
    overscan,
    gap,
    getItemKey: getItemKey
      ? (index) => getItemKey(items[index], index)
      : undefined,
  });

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    let ticking = false;
    const handleScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        const threshold = 50;
        isAtBottomRef.current =
          el.scrollHeight - el.scrollTop - el.clientHeight < threshold;
        ticking = false;
      });
    };

    el.addEventListener("scroll", handleScroll, { passive: true });
    return () => el.removeEventListener("scroll", handleScroll);
  }, []);

  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el || !autoScrollToBottom || items.length === 0) {
      return;
    }

    if (isInitialMountRef.current) {
      isInitialMountRef.current = false;
      el.scrollTop = el.scrollHeight;
      return;
    }
  }, [autoScrollToBottom, items.length]);

  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (
      !el ||
      !autoScrollToBottom ||
      items.length === 0 ||
      isInitialMountRef.current ||
      !isAtBottomRef.current
    ) {
      return;
    }

    el.scrollTop = el.scrollHeight;
  }, [autoScrollToBottom, items]);

  const virtualItems = virtualizer.getVirtualItems();

  return (
    <div
      ref={scrollRef}
      className={`${className} scrollbar-hide`}
      style={{
        height: "100%",
        overflow: "auto",
        scrollBehavior: "auto",
      }}
    >
      {items.length > 0 && (
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
      )}
      {footer}
    </div>
  );
}
