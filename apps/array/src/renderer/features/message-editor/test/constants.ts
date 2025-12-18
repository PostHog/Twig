// Session IDs
export const TEST_SESSION_ID = "test-session";
export const OTHER_SESSION_ID = "other-session";

// CSS classes
export const CSS = {
  CHIP: "mention-chip",
  FILE_CHIP: "cli-file-mention",
  COMMAND_CHIP: "cli-slash-command",
  SELECTED: "suggestion-item-selected",
} as const;

// ARIA labels
export const ARIA = {
  FILE_SUGGESTIONS: "File suggestions",
  COMMAND_SUGGESTIONS: "Available commands",
  LOADING: "Loading suggestions",
  ERROR: "Error loading suggestions",
} as const;

// Empty state messages
export const EMPTY_MESSAGES = {
  file: "No files found",
  command: "No commands available",
} as const;

// Loading messages
export const LOADING_TEXT = "Searching...";

// Trigger characters
export const TRIGGERS = {
  FILE: "@",
  COMMAND: "/",
} as const;

// Default position for tests
export const DEFAULT_POSITION = { x: 0, y: 0 };
