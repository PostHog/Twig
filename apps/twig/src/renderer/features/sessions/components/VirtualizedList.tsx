import {
  type ScrollToOptions,
  useVirtualizer,
  type VirtualizerOptions,
} from "@tanstack/react-virtual";
import {
  forwardRef,
  type ReactNode,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
} from "react";

type VirtualizerOpts = VirtualizerOptions<HTMLDivElement, Element>;

interface VirtualizedListProps<T> {
  items: T[];
  estimateSize: number;
  renderItem: (item: T, index: number) => ReactNode;
  getItemKey?: (item: T, index: number) => string | number;
  overscan?: VirtualizerOpts["overscan"];
  gap?: VirtualizerOpts["gap"];
  paddingStart?: VirtualizerOpts["paddingStart"];
  paddingEnd?: VirtualizerOpts["paddingEnd"];
  className?: string;
  innerClassName?: string;
  autoScrollToBottom?: boolean;
  footer?: ReactNode;
  onScroll?: (
    scrollOffset: number,
    scrollHeight: number,
    clientHeight: number,
  ) => void;
}

export interface VirtualizedListHandle {
  scrollToIndex: (index: number, options?: ScrollToOptions) => void;
  scrollToOffset: (offset: number, options?: ScrollToOptions) => void;
  scrollToBottom: () => void;
  measure: () => void;
}

function VirtualizedListInner<T>(
  {
    items,
    estimateSize,
    renderItem,
    getItemKey,
    overscan,
    className,
    innerClassName,
    autoScrollToBottom = false,
    gap,
    paddingStart,
    paddingEnd,
    footer,
    onScroll,
  }: VirtualizedListProps<T>,
  ref: React.ForwardedRef<VirtualizedListHandle>,
) {
  const scrollRef = useRef<HTMLDivElement>(null);

  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => estimateSize,
    overscan,
    gap,
    paddingStart,
    paddingEnd,
    getItemKey: getItemKey
      ? (index) => getItemKey(items[index], index)
      : undefined,
  });

  useImperativeHandle(
    ref,
    () => ({
      scrollToIndex: (index, options) =>
        virtualizer.scrollToIndex(index, options),
      scrollToOffset: (offset, options) =>
        virtualizer.scrollToOffset(offset, options),
      scrollToBottom: () => {
        if (items.length > 0) {
          virtualizer.scrollToIndex(items.length - 1, { align: "end" });
        }
      },
      measure: () => virtualizer.measure(),
    }),
    [virtualizer, items.length],
  );

  useEffect(() => {
    if (autoScrollToBottom && items.length > 0) {
      virtualizer.scrollToIndex(items.length - 1, { align: "end" });
    }
  }, [autoScrollToBottom, items.length, virtualizer]);

  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (el && onScroll) {
      onScroll(el.scrollTop, el.scrollHeight, el.clientHeight);
    }
  }, [onScroll]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el || !onScroll) return;

    el.addEventListener("scroll", handleScroll);
    return () => el.removeEventListener("scroll", handleScroll);
  }, [handleScroll, onScroll]);

  const virtualItems = virtualizer.getVirtualItems();

  return (
    <div
      ref={scrollRef}
      className={className ?? ""}
      style={{
        height: "100%",
        overflow: "auto",
      }}
    >
      <div className={innerClassName}>
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
              ref={virtualizer.measureElement}
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
    </div>
  );
}

export const VirtualizedList = forwardRef(VirtualizedListInner) as <T>(
  props: VirtualizedListProps<T> & {
    ref?: React.ForwardedRef<VirtualizedListHandle>;
  },
) => ReturnType<typeof VirtualizedListInner>;
