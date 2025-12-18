import type { SuggestionKeyDownProps } from "@tiptap/suggestion";
import { afterEach, beforeEach, vi } from "vitest";
import {
  type MessageEditorActions,
  useMessageEditorStore,
} from "../stores/messageEditorStore";
import { SuggestionSource } from "../suggestions/suggestionRenderer";
import type { SuggestionItem, SuggestionType } from "../types";

export const mockItems: SuggestionItem[] = [
  { id: "1", label: "first.ts" },
  { id: "2", label: "second.ts" },
  { id: "3", label: "third.ts" },
];

export function createKeyDownProps(key: string): SuggestionKeyDownProps {
  return {
    event: { key } as KeyboardEvent,
    view: {} as never,
    range: { from: 0, to: 0 },
  } as SuggestionKeyDownProps;
}

interface MockEditor {
  view: { state: { doc: object } };
  state: { selection: { from: number; to: number } };
  commands: { clearContent: ReturnType<typeof vi.fn> };
}

export function createMockEditor(): MockEditor {
  return {
    view: { state: { doc: {} } },
    state: { selection: { from: 0, to: 0 } },
    commands: { clearContent: vi.fn() },
  };
}

export function createMockSuggestionProps() {
  return {
    editor: createMockEditor() as never,
    command: vi.fn(),
    query: "test",
    range: { from: 0, to: 0 },
    text: "test",
    clientRect: null,
    decorationNode: null,
    items: [],
  };
}

export class MockSource extends SuggestionSource<SuggestionItem> {
  readonly trigger: string;
  readonly type: SuggestionType;
  override readonly allowSpaces?: boolean;
  getItems = vi.fn().mockResolvedValue(mockItems.slice(0, 2));
  onSelect = vi.fn();

  constructor(
    overrides: {
      trigger?: string;
      type?: SuggestionType;
      allowSpaces?: boolean;
    } = {},
  ) {
    super("test-session");
    this.trigger = overrides.trigger ?? "@";
    this.type = overrides.type ?? "file";
    this.allowSpaces = overrides.allowSpaces;
  }
}

export function createMockSource(
  overrides: {
    trigger?: string;
    type?: SuggestionType;
    allowSpaces?: boolean;
  } = {},
): MockSource {
  return new MockSource(overrides);
}

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
