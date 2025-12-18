import { useCallback, useEffect, useRef, useState } from "react";
import { useSuggestionStore } from "../stores/suggestionStore";

export function SuggestionList() {
  const items = useSuggestionStore((s) => s.items);
  const selectedIndex = useSuggestionStore((s) => s.selectedIndex);
  const type = useSuggestionStore((s) => s.type);
  const loadingState = useSuggestionStore((s) => s.loadingState);
  const error = useSuggestionStore((s) => s.error);
  const actions = useSuggestionStore((s) => s.actions);

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

  const footer = (
    <div className="suggestion-footer">
      <span className="suggestion-footer-text">
        <kbd>↑</kbd>
        <kbd>↓</kbd> navigate · <kbd>Enter</kbd> select · <kbd>Esc</kbd> dismiss
      </span>
    </div>
  );

  if (loadingState === "loading") {
    return (
      <div className="suggestion-list">
        <output className="suggestion-loading" aria-label="Loading suggestions">
          <span className="suggestion-loading-text">Searching...</span>
        </output>
        {footer}
      </div>
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
        {footer}
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="suggestion-list">
        <div className="suggestion-empty">
          <span className="suggestion-empty-text">{emptyMessage}</span>
        </div>
        {footer}
      </div>
    );
  }

  return (
    <div className="suggestion-list">
      <div
        ref={containerRef}
        role="listbox"
        aria-label={ariaLabel}
        aria-activedescendant={selectedItemId}
        onMouseMove={handleMouseMove}
        className="suggestion-list-scrollable"
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
              onClick={() => actions.selectItem(index)}
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
      </div>
      {footer}
    </div>
  );
}
