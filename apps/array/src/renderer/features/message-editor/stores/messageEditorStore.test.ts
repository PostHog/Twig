import type { AvailableCommand } from "@agentclientprotocol/sdk";
import { act } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  mockItems,
  openSuggestion,
  setupSuggestionTests,
} from "../test/helpers";
import { useMessageEditorStore } from "./messageEditorStore";

const SESSION_ID = "session-1";

const getState = () => useMessageEditorStore.getState();
const getActions = () => getState().actions;
const getSuggestion = () => getState().suggestion;

const MOCK_COMMANDS: AvailableCommand[] = [
  { name: "test", description: "Test" },
  { name: "help", description: "Help" },
];

describe("messageEditorStore", () => {
  setupSuggestionTests();

  describe("draft management", () => {
    it("sets and retrieves drafts", () => {
      const draft = { type: "doc", content: [{ type: "paragraph" }] };

      act(() => getActions().setDraft(SESSION_ID, draft));

      expect(getState().drafts[SESSION_ID]).toEqual(draft);
    });

    it("clears draft when set to null", () => {
      const draft = { type: "doc", content: [] };

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

  describe("suggestion", () => {
    describe("opening", () => {
      it("opens with correct initial state", () => {
        expect(getSuggestion().active).toBe(false);

        act(() => openSuggestion(SESSION_ID, "file", { x: 100, y: 200 }));

        expect(getSuggestion()).toMatchObject({
          active: true,
          sessionId: SESSION_ID,
          type: "file",
          position: { x: 100, y: 200 },
          items: [],
          selectedIndex: 0,
        });
      });
    });

    describe("loading states", () => {
      it("sets loading state", () => {
        act(() => {
          openSuggestion(SESSION_ID);
          getActions().setSuggestionLoadingState("loading");
        });

        expect(getSuggestion().loadingState).toBe("loading");
      });

      it("sets error state with message", () => {
        act(() => {
          openSuggestion(SESSION_ID);
          getActions().setSuggestionLoadingState("error", "Failed");
        });

        expect(getSuggestion().loadingState).toBe("error");
        expect(getSuggestion().error).toBe("Failed");
      });
    });

    describe("navigation", () => {
      it("navigates with selectNext and selectPrevious", () => {
        act(() => {
          openSuggestion(SESSION_ID);
          getActions().setSuggestionItems(mockItems);
        });

        expect(getSuggestion().selectedIndex).toBe(0);

        act(() => getActions().selectNext());
        expect(getSuggestion().selectedIndex).toBe(1);

        act(() => getActions().selectPrevious());
        expect(getSuggestion().selectedIndex).toBe(0);
      });

      it("wraps selection at boundaries", () => {
        act(() => {
          openSuggestion(SESSION_ID);
          getActions().setSuggestionItems(mockItems.slice(0, 2));
        });

        act(() => getActions().selectPrevious());
        expect(getSuggestion().selectedIndex).toBe(1);

        act(() => getActions().selectNext());
        expect(getSuggestion().selectedIndex).toBe(0);
      });

      it("returns correct selected item", () => {
        act(() => {
          openSuggestion(SESSION_ID);
          getActions().setSuggestionItems(mockItems);
        });

        const { items, selectedIndex } = getSuggestion();
        expect(items[selectedIndex]).toEqual(mockItems[0]);

        act(() => getActions().selectNext());
        expect(getSuggestion().items[getSuggestion().selectedIndex]).toEqual(
          mockItems[1],
        );
      });
    });

    describe("closing", () => {
      it("resets state on close", () => {
        act(() => {
          openSuggestion(SESSION_ID);
          getActions().setSuggestionItems(mockItems);
          getActions().closeSuggestion();
        });

        expect(getSuggestion().active).toBe(false);
        expect(getSuggestion().items).toEqual([]);
      });
    });

    describe("callbacks", () => {
      it("stores onSelectItem callback", () => {
        const callback = vi.fn();

        act(() => {
          openSuggestion(SESSION_ID);
          getActions().setOnSelectItem(callback);
        });

        expect(getSuggestion().onSelectItem).toBe(callback);
      });
    });
  });
});
