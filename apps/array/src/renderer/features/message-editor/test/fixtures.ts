import type { EditorContent, MentionChip } from "../core/content";
import type { TriggerMatch } from "../core/triggers";
import type { SuggestionItem, SuggestionType } from "../types";
import { TRIGGERS } from "./constants";

// Suggestion items - canonical list with descriptions
export const SUGGESTION_ITEMS: SuggestionItem[] = [
  { id: "1", label: "first.ts", description: "src/first.ts" },
  { id: "2", label: "second.ts", description: "src/second.ts" },
  { id: "3", label: "third.ts" },
];

// Pre-built chips for common test scenarios
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

// Factory: create a chip with optional overrides
export function createChip(overrides: Partial<MentionChip> = {}): MentionChip {
  return { type: "file", id: "test.ts", label: "test.ts", ...overrides };
}

// Factory: create a trigger match with optional overrides
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

// Factory: create simple text content
export function createContent(text: string): EditorContent {
  return { segments: [{ type: "text", text }] };
}

// Factory: create content with a chip
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

// Factory: create a chip of a specific type
export function createChipOfType(
  type: MentionChip["type"],
  id = "test-id",
  label = "test-label",
): MentionChip {
  return { type, id, label };
}

// All chip types for parameterized tests
export const ALL_CHIP_TYPES: MentionChip["type"][] = [
  "file",
  "command",
  "error",
  "experiment",
  "insight",
  "feature_flag",
];
