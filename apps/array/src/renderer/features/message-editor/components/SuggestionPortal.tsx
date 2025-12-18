import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { useSuggestionStore } from "../stores/suggestionStore";
import { SuggestionList } from "./SuggestionList";

interface SuggestionPortalProps {
  sessionId: string;
}

export function SuggestionPortal({ sessionId }: SuggestionPortalProps) {
  const suggestionSessionId = useSuggestionStore((s) => s.sessionId);
  const active = useSuggestionStore((s) => s.active);
  const position = useSuggestionStore((s) => s.position);
  const close = useSuggestionStore((s) => s.actions.close);
  const popupRef = useRef<HTMLDivElement>(null);

  const isActive = active && suggestionSessionId === sessionId;

  useEffect(() => {
    if (!isActive) return;

    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      const popup = popupRef.current;

      if (popup && !popup.contains(target)) {
        const editor = document.querySelector(".cli-editor");
        if (!editor?.contains(target)) {
          close();
        }
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isActive, close]);

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
