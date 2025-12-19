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

const Kbd = ({ children }: { children: string }) => (
  <kbd className="mx-0.5 rounded border border-[var(--gray-a6)] bg-[var(--gray-a3)] px-1 font-mono text-[10px]">
    {children}
  </kbd>
);

const CONTAINER_CLASS =
  "flex min-w-[300px] flex-col rounded border border-[var(--gray-a6)] bg-[var(--color-panel-solid)] font-mono text-xs shadow-lg";

export const SuggestionList = forwardRef<
  SuggestionListRef,
  SuggestionListProps
>(({ items, command }, ref) => {
  const isDarkMode = useThemeStore((state) => state.isDarkMode);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const [hasMouseMoved, setHasMouseMoved] = useState(false);
  const prevItemsRef = useRef(items);

  if (prevItemsRef.current !== items) {
    prevItemsRef.current = items;
    setSelectedIndex(0);
    setHasMouseMoved(false);
  }

  useEffect(() => {
    itemRefs.current[selectedIndex]?.scrollIntoView({ block: "nearest" });
  }, [selectedIndex]);

  useImperativeHandle(ref, () => ({
    onKeyDown: ({ event }) => {
      if (event.key === "ArrowUp") {
        setSelectedIndex((i) => (i + items.length - 1) % items.length);
        return true;
      }
      if (event.key === "ArrowDown") {
        setSelectedIndex((i) => (i + 1) % items.length);
        return true;
      }
      if (event.key === "Enter" || event.key === "Tab") {
        if (items[selectedIndex]) command(items[selectedIndex]);
        return true;
      }
      return false;
    },
  }));

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
        <div className={CONTAINER_CLASS}>
          <div className="p-2 text-[var(--gray-11)]">No results found</div>
        </div>
      </Theme>
    );
  }

  return (
    <Theme {...themeProps}>
      <div className={CONTAINER_CLASS}>
        <div
          role="listbox"
          className="max-h-60 flex-1 overflow-y-auto pb-1 [&::-webkit-scrollbar]:hidden"
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
                className={`flex w-full flex-col gap-0.5 border-none px-2 text-left ${
                  item.description ? "py-1.5" : "py-1"
                } ${isSelected ? "bg-[var(--accent-a4)]" : ""}`}
              >
                <span
                  className={`truncate ${isSelected ? "text-[var(--accent-11)]" : "text-[var(--gray-11)]"}`}
                >
                  {item.label}
                </span>
                {item.description && (
                  <span
                    className={`text-[11px] ${isSelected ? "text-[var(--accent-10)]" : "text-[var(--gray-10)]"}`}
                  >
                    {item.description}
                  </span>
                )}
              </button>
            );
          })}
        </div>
        <div className="border-[var(--gray-a4)] border-t bg-[var(--gray-a2)] px-2 py-1 text-[10px] text-[var(--gray-10)]">
          <Kbd>↑</Kbd>
          <Kbd>↓</Kbd> navigate · <Kbd>↵</Kbd> select · <Kbd>esc</Kbd> dismiss
        </div>
      </div>
    </Theme>
  );
});

SuggestionList.displayName = "SuggestionList";
