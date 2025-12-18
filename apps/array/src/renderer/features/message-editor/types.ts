import type { AvailableCommand } from "@agentclientprotocol/sdk";

export interface SuggestionItem {
  id: string;
  label: string;
  description?: string;
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
