import { beforeEach } from "vitest";
import type { EditorContent } from "../core/content";
import { useDraftStore } from "../stores/draftStore";
import { useSuggestionStore } from "../stores/suggestionStore";

export const TEST_SESSION_ID = "test-session-1";
export const OTHER_SESSION_ID = "test-session-2";

export const DEFAULT_POSITION = { x: 100, y: 200 };

export const SUGGESTION_ITEMS = [
  { id: "1", label: "Item 1" },
  { id: "2", label: "Item 2" },
  { id: "3", label: "Item 3" },
];

export function createContent(text: string): EditorContent {
  return {
    segments: [{ type: "text", text }],
  };
}

export function setupDraftTests() {
  beforeEach(() => {
    useDraftStore.setState({
      drafts: {},
      contexts: {},
      commands: {},
      _hasHydrated: true,
    });
  });
}

export function setupSuggestionTests() {
  beforeEach(() => {
    useSuggestionStore.setState({
      active: false,
      sessionId: null,
      type: null,
      items: [],
      selectedIndex: 0,
      position: null,
      loadingState: "idle",
      error: null,
      onSelect: null,
    });
  });
}

export function suggestionActions() {
  return useSuggestionStore.getState().actions;
}
