import { useVirtualizer } from "@tanstack/react-virtual";
import {
  type ReactNode,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
} from "react";

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

  const itemsRef = useRef(items);
  const getItemKeyRef = useRef(getItemKey);
  itemsRef.current = items;
  getItemKeyRef.current = getItemKey;

  const getScrollElement = useCallback(() => scrollRef.current, []);
  const getEstimateSize = useCallback(() => estimateSize, [estimateSize]);

  const hasGetItemKey = getItemKey !== undefined;
  const stableGetItemKey = useMemo(() => {
    if (!hasGetItemKey) return undefined;
    return (index: number) => {
      const currentItems = itemsRef.current;
      const currentGetKey = getItemKeyRef.current;
      if (!currentGetKey || !currentItems[index]) return index;
      return currentGetKey(currentItems[index], index);
    };
  }, [hasGetItemKey]);

  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement,
    estimateSize: getEstimateSize,
    overscan,
    gap,
    getItemKey: stableGetItemKey,
  });

  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const threshold = 50;
    isAtBottomRef.current =
      el.scrollHeight - el.scrollTop - el.clientHeight < threshold;
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.addEventListener("scroll", handleScroll);
    return () => el.removeEventListener("scroll", handleScroll);
  }, [handleScroll]);

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

  useEffect(() => {
    const el = scrollRef.current;
    if (
      !el ||
      !autoScrollToBottom ||
      items.length === 0 ||
      isInitialMountRef.current
    ) {
      return;
    }

    if (!isAtBottomRef.current) {
      return;
    }

    const scrollToBottom = () => {
      const el = scrollRef.current;
      if (el) {
        el.scrollTop = el.scrollHeight;
      }
    };
    requestAnimationFrame(() => {
      requestAnimationFrame(scrollToBottom);
    });
  }, [autoScrollToBottom, items]);

  const virtualItems = virtualizer.getVirtualItems();

  return (
    <div
      ref={scrollRef}
      className={className}
      style={{ height: "100%", overflow: "auto" }}
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
