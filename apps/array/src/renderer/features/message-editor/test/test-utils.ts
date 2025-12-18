import { act, fireEvent } from "@testing-library/react";
import { afterEach, beforeEach, vi } from "vitest";
import type { EditorContent, MentionChip } from "../core/content";
import type { TriggerMatch } from "../core/EditorController";
import { useDraftStore } from "../stores/draftStore";
import { useSuggestionStore } from "../stores/suggestionStore";
import type { SuggestionItem, SuggestionType } from "../types";

// =============================================================================
// Constants
// =============================================================================

export const TEST_SESSION_ID = "test-session";
export const OTHER_SESSION_ID = "other-session";

export const CSS = {
  CHIP: "mention-chip",
  FILE_CHIP: "cli-file-mention",
  COMMAND_CHIP: "cli-slash-command",
  SELECTED: "suggestion-item-selected",
} as const;

export const ARIA = {
  FILE_SUGGESTIONS: "File suggestions",
  COMMAND_SUGGESTIONS: "Available commands",
  LOADING: "Loading suggestions",
  ERROR: "Error loading suggestions",
} as const;

export const EMPTY_MESSAGES = {
  file: "No files found",
  command: "No commands available",
} as const;

export const LOADING_TEXT = "Searching...";

export const TRIGGERS = {
  FILE: "@",
  COMMAND: "/",
} as const;

export const DEFAULT_POSITION = { x: 0, y: 0 };

// =============================================================================
// Fixtures
// =============================================================================

export const SUGGESTION_ITEMS: SuggestionItem[] = [
  { id: "1", label: "first.ts", description: "src/first.ts" },
  { id: "2", label: "second.ts", description: "src/second.ts" },
  { id: "3", label: "third.ts" },
];

export const FILE_CHIP: MentionChip = {
  type: "file",
  id: "src/index.ts",
  label: "index.ts",
};

export const COMMAND_CHIP: MentionChip = {
  type: "command",
  id: "help",
  label: "help",
};

export const ALL_CHIP_TYPES: MentionChip["type"][] = [
  "file",
  "command",
  "error",
  "experiment",
  "insight",
  "feature_flag",
];

// =============================================================================
// Factories
// =============================================================================

export function createChip(overrides: Partial<MentionChip> = {}): MentionChip {
  return { type: "file", id: "test.ts", label: "test.ts", ...overrides };
}

export function createTrigger(
  overrides: Partial<TriggerMatch> = {},
): TriggerMatch {
  const type: SuggestionType = (overrides.type as SuggestionType) ?? "file";
  const trigger = type === "file" ? TRIGGERS.FILE : TRIGGERS.COMMAND;
  const query = overrides.query ?? "test";
  return {
    type,
    trigger,
    query,
    startOffset: overrides.startOffset ?? 0,
    endOffset: overrides.endOffset ?? trigger.length + query.length,
    ...overrides,
  };
}

export function createContent(text: string): EditorContent {
  return { segments: [{ type: "text", text }] };
}

export function createContentWithChip(
  before: string,
  chip: MentionChip,
  after = "",
): EditorContent {
  const segments: EditorContent["segments"] = [];
  if (before) segments.push({ type: "text", text: before });
  segments.push({ type: "chip", chip });
  if (after) segments.push({ type: "text", text: after });
  return { segments };
}

export function createChipOfType(
  type: MentionChip["type"],
  id = "test-id",
  label = "test-label",
): MentionChip {
  return { type, id, label };
}

// =============================================================================
// Store Accessors
// =============================================================================

export const suggestionActions = () => useSuggestionStore.getState().actions;
export const draftActions = () => useDraftStore.getState().actions;

// =============================================================================
// DOM Helpers
// =============================================================================

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

export function getListbox(): HTMLElement | null {
  return document.querySelector('[role="listbox"]');
}

export function getOptions(): HTMLElement[] {
  return Array.from(document.querySelectorAll('[role="option"]'));
}

export function getPopup(): HTMLElement | null {
  return document.querySelector("[data-suggestion-popup]");
}

export function enableMouseInteraction(): void {
  const listbox = getListbox();
  if (listbox) {
    fireEvent.mouseMove(listbox);
  }
}

// =============================================================================
// Setup Helpers
// =============================================================================

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

// =============================================================================
// Suggestion Setup
// =============================================================================

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

export function openSuggestionSimple(
  sessionId = TEST_SESSION_ID,
  type: SuggestionType = "file",
  position = DEFAULT_POSITION,
): ReturnType<typeof suggestionActions> {
  const actions = suggestionActions();
  actions.open(sessionId, type, position);
  return actions;
}

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
