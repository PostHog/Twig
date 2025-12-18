import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { useMessageEditorStore } from "../stores/messageEditorStore";
import { SuggestionList } from "./SuggestionList";

interface SuggestionPortalProps {
  sessionId: string;
}

export function SuggestionPortal({ sessionId }: SuggestionPortalProps) {
  const suggestionSessionId = useMessageEditorStore(
    (s) => s.suggestion.sessionId,
  );
  const active = useMessageEditorStore((s) => s.suggestion.active);
  const position = useMessageEditorStore((s) => s.suggestion.position);
  const triggerExit = useMessageEditorStore((s) => s.suggestion.triggerExit);
  const popupRef = useRef<HTMLDivElement>(null);

  const isActive = active && suggestionSessionId === sessionId;

  useEffect(() => {
    if (!isActive) return;

    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      const popup = popupRef.current;

      // Check if click is outside the popup
      if (popup && !popup.contains(target)) {
        // Also check if click is inside the editor (don't close if clicking in editor)
        const editor = document.querySelector(".cli-editor");
        if (!editor?.contains(target)) {
          // Use tiptap's exitSuggestion to properly close and reset plugin state
          triggerExit?.();
        }
      }
    };

    // Use mousedown to catch the click before focus changes
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isActive, triggerExit]);

  if (!isActive) {
    return null;
  }

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
      <SuggestionList />
    </div>,
    document.body,
  );
}
