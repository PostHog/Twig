import { beforeEach } from "vitest";
import type { EditorContent } from "../core/content";
import { useDraftStore } from "../stores/draftStore";

export const TEST_SESSION_ID = "test-session-1";
export const OTHER_SESSION_ID = "test-session-2";

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
