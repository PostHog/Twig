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

  const isActive = active && suggestionSessionId === sessionId;

  if (!isActive) {
    return null;
  }

  return createPortal(
    <div
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
