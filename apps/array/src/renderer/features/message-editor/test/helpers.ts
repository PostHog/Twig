import { afterEach, beforeEach, vi } from "vitest";
import {
  type MessageEditorActions,
  useMessageEditorStore,
} from "../stores/messageEditorStore";
import type { SuggestionItem } from "../types";

export const mockItems: SuggestionItem[] = [
  { id: "1", label: "first.ts" },
  { id: "2", label: "second.ts" },
  { id: "3", label: "third.ts" },
];

const getActions = () => useMessageEditorStore.getState().actions;

export function setupSuggestionTests() {
  beforeEach(() => {
    getActions().closeSuggestion();
    vi.clearAllMocks();
  });

  afterEach(() => {
    getActions().closeSuggestion();
  });
}

export function openSuggestion(
  sessionId = "session-1",
  type: "file" | "command" = "file",
  position = { x: 100, y: 200 },
): MessageEditorActions {
  const actions = getActions();
  actions.openSuggestion(sessionId, type, position);
  return actions;
}

export function openSuggestionWithItems(
  items: SuggestionItem[] = mockItems,
  sessionId = "session-1",
  type: "file" | "command" = "file",
): MessageEditorActions {
  const actions = openSuggestion(sessionId, type);
  actions.setSuggestionItems(items);
  if (items.length > 0) {
    actions.setSuggestionLoadingState("success");
  }
  return actions;
}
