import { act, fireEvent } from "@testing-library/react";
import { afterEach, beforeEach, vi } from "vitest";
import { useDraftStore } from "../stores/draftStore";
import { useSuggestionStore } from "../stores/suggestionStore";
import type { SuggestionItem, SuggestionType } from "../types";
import { DEFAULT_POSITION, TEST_SESSION_ID } from "./constants";
import { SUGGESTION_ITEMS } from "./fixtures";

// Re-export for convenience
export { SUGGESTION_ITEMS } from "./fixtures";

// Store action accessors
export const suggestionActions = () => useSuggestionStore.getState().actions;
export const draftActions = () => useDraftStore.getState().actions;

// DOM helpers
export function setCursor(element: HTMLElement, offset: number): void {
  const range = document.createRange();
  const textNode = element.firstChild;
  if (textNode?.nodeType === Node.TEXT_NODE) {
    range.setStart(
      textNode,
      Math.min(offset, textNode.textContent?.length ?? 0),
    );
    range.collapse(true);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
  }
}

export function getCursorOffset(): number | null {
  const selection = window.getSelection();
  if (!selection?.rangeCount) return null;
  return selection.getRangeAt(0).startOffset;
}

// Setup helpers for test suites
export function setupSuggestionTests(): void {
  beforeEach(() => {
    suggestionActions().close();
    vi.clearAllMocks();
  });
  afterEach(() => {
    suggestionActions().close();
  });
}

export function setupDraftTests(): void {
  beforeEach(() => {
    useDraftStore.setState({
      drafts: {},
      contexts: {},
      commands: {},
      _hasHydrated: true,
    });
  });
}

// Suggestion setup configuration
export interface SuggestionSetup {
  sessionId?: string;
  type?: SuggestionType;
  items?: SuggestionItem[];
  selectedIndex?: number;
  position?: { x: number; y: number };
  loadingState?: "idle" | "loading" | "success" | "error";
  error?: string;
  onSelectItem?: (index: number) => void;
}

// Open suggestion with full configuration
export function openSuggestion(setup: SuggestionSetup = {}): void {
  act(() => {
    const actions = suggestionActions();
    actions.open(
      setup.sessionId ?? TEST_SESSION_ID,
      setup.type ?? "file",
      setup.position ?? DEFAULT_POSITION,
      setup.onSelectItem,
    );
    actions.setItems(setup.items ?? SUGGESTION_ITEMS);
    if (setup.selectedIndex !== undefined) {
      actions.setSelectedIndex(setup.selectedIndex);
    }
    actions.setLoadingState(setup.loadingState ?? "success", setup.error);
  });
}

// Simple version for basic tests
export function openSuggestionSimple(
  sessionId = TEST_SESSION_ID,
  type: SuggestionType = "file",
  position = DEFAULT_POSITION,
): ReturnType<typeof suggestionActions> {
  const actions = suggestionActions();
  actions.open(sessionId, type, position);
  return actions;
}

// Open with items and mark as success
export function openSuggestionWithItems(
  items: SuggestionItem[] = SUGGESTION_ITEMS,
  sessionId = TEST_SESSION_ID,
  type: SuggestionType = "file",
): ReturnType<typeof suggestionActions> {
  const actions = openSuggestionSimple(sessionId, type);
  actions.setItems(items);
  if (items.length > 0) {
    actions.setLoadingState("success");
  }
  return actions;
}

// DOM element helpers for component tests
// Using document.querySelector to work with portals
export function getListbox(): HTMLElement | null {
  return document.querySelector('[role="listbox"]');
}

export function getOptions(): HTMLElement[] {
  return Array.from(document.querySelectorAll('[role="option"]'));
}

export function getPopup(): HTMLElement | null {
  return document.querySelector("[data-suggestion-popup]");
}

// Enable mouse interaction (needed because hover is ignored until mouse moves)
export function enableMouseInteraction(): void {
  const listbox = getListbox();
  if (listbox) {
    fireEvent.mouseMove(listbox);
  }
}
