import { Theme } from "@radix-ui/themes";
import { useThemeStore } from "@stores/themeStore";
import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import type { SuggestionItem } from "../types";

export interface SuggestionListRef {
  onKeyDown: (props: { event: KeyboardEvent }) => boolean;
}

export interface SuggestionListProps {
  items: SuggestionItem[];
  command: (item: SuggestionItem) => void;
}

export const SuggestionList = forwardRef<
  SuggestionListRef,
  SuggestionListProps
>(({ items, command }, ref) => {
  const isDarkMode = useThemeStore((state) => state.isDarkMode);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const [hasMouseMoved, setHasMouseMoved] = useState(false);
  const prevItemsRef = useRef(items);

  if (prevItemsRef.current !== items) {
    prevItemsRef.current = items;
    setSelectedIndex(0);
    setHasMouseMoved(false);
  }

  useEffect(() => {
    const container = containerRef.current;
    const item = itemRefs.current[selectedIndex];
    if (!container || !item) return;

    const containerTop = container.scrollTop;
    const containerBottom = containerTop + container.clientHeight;
    const itemTop = item.offsetTop;
    const itemBottom = itemTop + item.offsetHeight;

    if (itemTop < containerTop) {
      container.scrollTop = itemTop;
    } else if (itemBottom > containerBottom) {
      container.scrollTop = itemBottom - container.clientHeight;
    }
  }, [selectedIndex]);

  useImperativeHandle(ref, () => ({
    onKeyDown: ({ event }) => {
      if (event.key === "ArrowUp") {
        setSelectedIndex((prev) => (prev + items.length - 1) % items.length);
        return true;
      }

      if (event.key === "ArrowDown") {
        setSelectedIndex((prev) => (prev + 1) % items.length);
        return true;
      }

      if (event.key === "Enter" || event.key === "Tab") {
        const item = items[selectedIndex];
        if (item) {
          command(item);
        }
        return true;
      }

      return false;
    },
  }));

  const kbd = (key: string) => (
    <kbd className="mx-[2px] rounded border border-[var(--gray-a6)] bg-[var(--gray-a3)] px-1 font-mono text-[10px]">
      {key}
    </kbd>
  );

  const themeProps = {
    appearance: isDarkMode ? "dark" : "light",
    accentColor: isDarkMode ? "orange" : "yellow",
    grayColor: "slate",
    panelBackground: "solid",
    radius: "none",
    scaling: "100%",
  } as const;

  if (items.length === 0) {
    return (
      <Theme {...themeProps}>
        <div className="flex min-w-[300px] flex-col rounded border border-[var(--gray-a6)] bg-[var(--color-panel-solid)] font-mono text-[12px] shadow-lg">
          <div className="p-2">
            <span className="text-[var(--gray-11)]">No results found</span>
          </div>
        </div>
      </Theme>
    );
  }

  return (
    <Theme {...themeProps}>
      <div className="flex min-w-[300px] flex-col rounded border border-[var(--gray-a6)] bg-[var(--color-panel-solid)] font-mono text-[12px] shadow-lg">
        <div
          ref={containerRef}
          role="listbox"
          className={`max-h-[240px] flex-1 overflow-y-auto pb-1 [&::-webkit-scrollbar]:hidden ${hasMouseMoved ? "" : "cursor-none"}`}
          onMouseMove={() => !hasMouseMoved && setHasMouseMoved(true)}
        >
          {items.map((item, index) => {
            const isSelected = index === selectedIndex;
            return (
              <button
                type="button"
                key={item.id}
                ref={(el) => {
                  itemRefs.current[index] = el;
                }}
                onClick={() => command(item)}
                onMouseEnter={() => hasMouseMoved && setSelectedIndex(index)}
                className={`flex w-full flex-col gap-[2px] border-none text-left ${
                  item.description ? "px-2 py-[6px]" : "px-2 py-1"
                } ${isSelected ? "bg-[var(--accent-a4)]" : "bg-transparent"} ${
                  hasMouseMoved ? "cursor-pointer" : "cursor-none"
                }`}
              >
                <span
                  className={`truncate ${
                    isSelected
                      ? "text-[var(--accent-11)]"
                      : "text-[var(--gray-11)]"
                  }`}
                >
                  {item.label}
                </span>
                {item.description && (
                  <span
                    className={`text-[11px] ${
                      isSelected
                        ? "text-[var(--accent-10)]"
                        : "text-[var(--gray-10)]"
                    }`}
                  >
                    {item.description}
                  </span>
                )}
              </button>
            );
          })}
        </div>
        <div className="border-[var(--gray-a4)] border-t bg-[var(--gray-a2)] px-2 py-1 text-[10px] text-[var(--gray-10)]">
          {kbd("↑")}
          {kbd("↓")} navigate · {kbd("↵")} select · {kbd("esc")} dismiss
        </div>
      </div>
    </Theme>
  );
});

SuggestionList.displayName = "SuggestionList";
