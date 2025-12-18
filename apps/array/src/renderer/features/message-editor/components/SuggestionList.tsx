import { useCallback, useEffect, useRef, useState } from "react";
import { useMessageEditorStore } from "../stores/messageEditorStore";

export function SuggestionList() {
  const items = useMessageEditorStore((s) => s.suggestion.items);
  const selectedIndex = useMessageEditorStore(
    (s) => s.suggestion.selectedIndex,
  );
  const type = useMessageEditorStore((s) => s.suggestion.type);
  const loadingState = useMessageEditorStore((s) => s.suggestion.loadingState);
  const error = useMessageEditorStore((s) => s.suggestion.error);
  const onSelectItem = useMessageEditorStore((s) => s.suggestion.onSelectItem);
  const actions = useMessageEditorStore((s) => s.actions);

  const emptyMessage =
    type === "command" ? "No commands available" : "No files found";
  const [hasMouseMoved, setHasMouseMoved] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const handleMouseMove = () => {
    if (!hasMouseMoved) setHasMouseMoved(true);
  };

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

  const ariaLabel =
    type === "command" ? "Available commands" : "File suggestions";
  const selectedItemId = items[selectedIndex]?.id
    ? `suggestion-${items[selectedIndex].id}`
    : undefined;

  if (loadingState === "loading") {
    return (
      <output className="suggestion-list" aria-label="Loading suggestions">
        <div className="suggestion-loading">
          <span className="suggestion-loading-text">Searching...</span>
        </div>
      </output>
    );
  }

  if (loadingState === "error" && error) {
    return (
      <div
        className="suggestion-list"
        role="alert"
        aria-label="Error loading suggestions"
      >
        <div className="suggestion-error">
          <span className="suggestion-error-text">{error}</span>
        </div>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <output className="suggestion-list">
        <div className="suggestion-empty">
          <span className="suggestion-empty-text">{emptyMessage}</span>
        </div>
      </output>
    );
  }

  return (
    <div
      ref={containerRef}
      role="listbox"
      aria-label={ariaLabel}
      aria-activedescendant={selectedItemId}
      onMouseMove={handleMouseMove}
      className="suggestion-list suggestion-list-scrollable"
      style={{
        cursor: hasMouseMoved ? undefined : "none",
      }}
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
            onClick={() => onSelectItem?.(item)}
            onMouseEnter={() =>
              hasMouseMoved && actions.setSelectedIndex(index)
            }
            className={`suggestion-item ${isSelected ? "suggestion-item-selected" : ""} ${
              item.description ? "suggestion-item-with-description" : ""
            }`}
            style={{
              cursor: hasMouseMoved ? "pointer" : "none",
            }}
          >
            <span className="suggestion-item-label">{item.label}</span>
            {item.description && (
              <span className="suggestion-item-description">
                {item.description}
              </span>
            )}
          </button>
        );
      })}
      <div className="suggestion-footer">
        <span className="suggestion-footer-text">
          <kbd>↑</kbd>
          <kbd>↓</kbd> navigate · <kbd>Enter</kbd> select · <kbd>Esc</kbd>{" "}
          dismiss
        </span>
      </div>
    </div>
  );
}
