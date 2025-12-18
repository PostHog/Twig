import type { AvailableCommand } from "@agentclientprotocol/sdk";
import { act } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import type { EditorContent } from "../core/content";
import { useMessageEditorStore } from "./messageEditorStore";

const SESSION_ID = "session-1";

const getState = () => useMessageEditorStore.getState();
const getActions = () => getState().actions;

const MOCK_COMMANDS: AvailableCommand[] = [
  { name: "test", description: "Test" },
  { name: "help", description: "Help" },
];

describe("messageEditorStore", () => {
  beforeEach(() => {
    useMessageEditorStore.setState({
      drafts: {},
      contexts: {},
      commands: {},
      _hasHydrated: false,
      suggestion: useMessageEditorStore.getState().suggestion,
    });
  });

  describe("draft management", () => {
    it("sets and retrieves drafts", () => {
      const draft: EditorContent = {
        segments: [{ type: "text", text: "Hello world" }],
      };

      act(() => getActions().setDraft(SESSION_ID, draft));

      expect(getState().drafts[SESSION_ID]).toEqual(draft);
    });

    it("stores drafts with chips", () => {
      const draft: EditorContent = {
        segments: [
          { type: "text", text: "Check " },
          {
            type: "chip",
            chip: { type: "file", id: "src/index.ts", label: "index.ts" },
          },
          { type: "text", text: " please" },
        ],
      };

      act(() => getActions().setDraft(SESSION_ID, draft));

      expect(getState().drafts[SESSION_ID]).toEqual(draft);
    });

    it("clears draft when set to null", () => {
      const draft: EditorContent = {
        segments: [{ type: "text", text: "Some text" }],
      };

      act(() => {
        getActions().setDraft(SESSION_ID, draft);
        getActions().setDraft(SESSION_ID, null);
      });

      expect(getState().drafts[SESSION_ID]).toBeUndefined();
    });

    it("returns undefined for unknown session", () => {
      expect(getState().drafts.unknown).toBeUndefined();
    });
  });

  describe("context management", () => {
    it("stores taskId and repoPath per session", () => {
      act(() => {
        getActions().setContext(SESSION_ID, {
          taskId: "task-123",
          repoPath: "/path/to/repo",
        });
      });

      const context = getState().contexts[SESSION_ID];
      expect(context?.taskId).toBe("task-123");
      expect(context?.repoPath).toBe("/path/to/repo");
    });

    it("removes context on removeContext", () => {
      act(() => {
        getActions().setContext(SESSION_ID, { taskId: "task-1" });
        getActions().removeContext(SESSION_ID);
      });

      expect(getState().contexts[SESSION_ID]).toBeUndefined();
    });

    it("returns undefined for unknown session context", () => {
      expect(getState().contexts.unknown).toBeUndefined();
    });
  });

  describe("command storage", () => {
    it("stores and retrieves commands by sessionId", () => {
      act(() => getActions().setCommands(SESSION_ID, MOCK_COMMANDS));

      expect(getState().commands[SESSION_ID]).toEqual(MOCK_COMMANDS);
    });

    it("clears commands for session", () => {
      act(() => {
        getActions().setCommands(SESSION_ID, MOCK_COMMANDS);
        getActions().clearCommands(SESSION_ID);
      });

      expect(getState().commands[SESSION_ID]).toBeUndefined();
    });

    it("returns undefined for unknown session", () => {
      expect(getState().commands.unknown).toBeUndefined();
    });
  });
});
