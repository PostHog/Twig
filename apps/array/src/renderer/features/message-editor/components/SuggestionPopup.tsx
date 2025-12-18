import { PORTAL_CONTAINER_ID } from "@components/ThemeWrapper";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useSuggestionStore } from "../stores/suggestionStore";

interface SuggestionPopupProps {
  sessionId: string;
}

export function SuggestionPopup({ sessionId }: SuggestionPopupProps) {
  const suggestionSessionId = useSuggestionStore((s) => s.sessionId);
  const active = useSuggestionStore((s) => s.active);
  const position = useSuggestionStore((s) => s.position);
  const items = useSuggestionStore((s) => s.items);
  const selectedIndex = useSuggestionStore((s) => s.selectedIndex);
  const type = useSuggestionStore((s) => s.type);
  const loadingState = useSuggestionStore((s) => s.loadingState);
  const error = useSuggestionStore((s) => s.error);
  const actions = useSuggestionStore((s) => s.actions);

  const popupRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const [hasMouseMoved, setHasMouseMoved] = useState(false);

  const isActive = active && suggestionSessionId === sessionId;

  // Click outside handler
  useEffect(() => {
    if (!isActive) return;

    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      const popup = popupRef.current;

      if (popup && !popup.contains(target)) {
        const editor = document.querySelector(".cli-editor");
        if (!editor?.contains(target)) {
          actions.close();
        }
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isActive, actions]);

  // Scroll selected item into view
  const scrollIntoView = useCallback((index: number) => {
    const container = containerRef.current;
    const item = itemRefs.current[index];
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
  }, []);

  useEffect(() => {
    itemRefs.current = itemRefs.current.slice(0, items.length);
  }, [items.length]);

  useEffect(() => {
    scrollIntoView(selectedIndex);
  }, [selectedIndex, scrollIntoView]);

  useEffect(() => {
    setHasMouseMoved(false);
  }, []);

  if (!isActive) {
    return null;
  }

  const handleMouseMove = () => {
    if (!hasMouseMoved) setHasMouseMoved(true);
  };

  const emptyMessage =
    type === "command" ? "No commands available" : "No files found";
  const ariaLabel =
    type === "command" ? "Available commands" : "File suggestions";
  const selectedItemId = items[selectedIndex]?.id
    ? `suggestion-${items[selectedIndex].id}`
    : undefined;

  const kbd = (key: string) => (
    <kbd className="mx-[2px] rounded border border-[var(--gray-a6)] bg-[var(--gray-a3)] px-1 font-mono text-[10px]">
      {key}
    </kbd>
  );

  const footer = (
    <div className="border-[var(--gray-a4)] border-t bg-[var(--gray-a2)] px-2 py-1 text-[10px] text-[var(--gray-10)]">
      {kbd("↑")}
      {kbd("↓")} navigate · {kbd("↵")} select · {kbd("esc")} dismiss
    </div>
  );

  const renderContent = () => {
    if (loadingState === "loading") {
      return (
        <output className="block p-2" aria-label="Loading suggestions">
          <span className="text-[var(--gray-11)]">Searching...</span>
        </output>
      );
    }

    if (loadingState === "error" && error) {
      return (
        <div
          className="p-2"
          role="alert"
          aria-label="Error loading suggestions"
        >
          <span className="text-[var(--red-11)]">{error}</span>
        </div>
      );
    }

    if (items.length === 0) {
      return (
        <div className="p-2">
          <span className="text-[var(--gray-11)]">{emptyMessage}</span>
        </div>
      );
    }

    return (
      <div
        ref={containerRef}
        role="listbox"
        aria-label={ariaLabel}
        aria-activedescendant={selectedItemId}
        onMouseMove={handleMouseMove}
        className={`max-h-[240px] flex-1 overflow-y-auto pb-1 [&::-webkit-scrollbar]:hidden ${hasMouseMoved ? "" : "cursor-none"}`}
        tabIndex={0}
      >
        {items.map((item, index) => {
          const isSelected = index === selectedIndex;
          const itemId = `suggestion-${item.id}`;
          return (
            <button
              type="button"
              role="option"
              aria-selected={isSelected}
              id={itemId}
              key={item.id}
              ref={(el) => {
                itemRefs.current[index] = el;
              }}
              onClick={() => actions.selectItem(index)}
              onMouseEnter={() =>
                hasMouseMoved && actions.setSelectedIndex(index)
              }
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
    );
  };

  const portalContainer =
    document.getElementById(PORTAL_CONTAINER_ID) ?? document.body;

  return createPortal(
    <div
      ref={popupRef}
      data-suggestion-popup
      style={{
        position: "fixed",
        left: position?.x ?? 0,
        top: position?.y ?? 0,
        width: "max-content",
        zIndex: 1000,
      }}
    >
      <div className="flex min-w-[300px] flex-col rounded border border-[var(--gray-a6)] bg-[var(--color-panel-solid)] font-mono text-[12px] shadow-lg">
        {renderContent()}
        {footer}
      </div>
    </div>,
    portalContainer,
  );
}
