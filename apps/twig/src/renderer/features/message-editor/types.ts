import type { AvailableCommand } from "@agentclientprotocol/sdk";
import type { EditorContent, MentionChip } from "./utils/content";

export interface EditorHandle {
  focus: () => void;
  blur: () => void;
  clear: () => void;
  isEmpty: () => boolean;
  getContent: () => EditorContent;
  getText: () => string;
  setContent: (text: string) => void;
  insertChip: (chip: MentionChip) => void;
}

export interface SuggestionItem {
  id: string;
  label: string;
  description?: string;
  filename?: string;
}

export interface FileSuggestionItem extends SuggestionItem {
  path: string;
}

export interface CommandSuggestionItem extends SuggestionItem {
  command: AvailableCommand;
}

export type SuggestionType = "file" | "command";
export type SuggestionLoadingState = "idle" | "loading" | "error" | "success";

export interface SuggestionPosition {
  x: number;
  y: number;
}
