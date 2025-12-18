import { beforeEach, describe, expect, it } from "vitest";
import {
  DEFAULT_POSITION,
  OTHER_SESSION_ID,
  SUGGESTION_ITEMS,
  setupSuggestionTests,
  suggestionActions,
  TEST_SESSION_ID,
} from "../test/test-utils";
import { useSuggestionStore } from "./suggestionStore";

const getState = () => useSuggestionStore.getState();

describe("suggestionStore", () => {
  setupSuggestionTests();

  describe("open / close", () => {
    it("opens suggestion with initial state", () => {
      const position = { x: 100, y: 200 };
      suggestionActions().open(TEST_SESSION_ID, "file", position);

      const state = getState();
      expect(state.active).toBe(true);
      expect(state.sessionId).toBe(TEST_SESSION_ID);
      expect(state.type).toBe("file");
      expect(state.position).toEqual(position);
      expect(state.items).toEqual([]);
      expect(state.selectedIndex).toBe(0);
    });

    it("closes suggestion and resets state", () => {
      suggestionActions().open(TEST_SESSION_ID, "file", DEFAULT_POSITION);
      suggestionActions().close();

      const state = getState();
      expect(state.active).toBe(false);
      expect(state.sessionId).toBeNull();
      expect(state.type).toBeNull();
      expect(state.position).toBeNull();
    });

    it("resets items when opening", () => {
      suggestionActions().open(TEST_SESSION_ID, "file", DEFAULT_POSITION);
      suggestionActions().setItems(SUGGESTION_ITEMS);
      suggestionActions().open(OTHER_SESSION_ID, "command", DEFAULT_POSITION);

      expect(getState().items).toEqual([]);
    });
  });

  describe("items", () => {
    it("sets items and resets selection", () => {
      suggestionActions().open(TEST_SESSION_ID, "file", DEFAULT_POSITION);
      suggestionActions().setSelectedIndex(1);
      suggestionActions().setItems(SUGGESTION_ITEMS);

      const state = getState();
      expect(state.items).toEqual(SUGGESTION_ITEMS);
      expect(state.selectedIndex).toBe(0);
    });
  });

  describe("selection", () => {
    beforeEach(() => {
      suggestionActions().open(TEST_SESSION_ID, "file", DEFAULT_POSITION);
      suggestionActions().setItems(SUGGESTION_ITEMS);
    });

    it("selects next item", () => {
      suggestionActions().selectNext();
      expect(getState().selectedIndex).toBe(1);

      suggestionActions().selectNext();
      expect(getState().selectedIndex).toBe(2);
    });

    it("wraps to first item", () => {
      suggestionActions().setSelectedIndex(2);
      suggestionActions().selectNext();

      expect(getState().selectedIndex).toBe(0);
    });

    it("selects previous item", () => {
      suggestionActions().setSelectedIndex(2);
      suggestionActions().selectPrevious();

      expect(getState().selectedIndex).toBe(1);
    });

    it("wraps to last item", () => {
      suggestionActions().selectPrevious();

      expect(getState().selectedIndex).toBe(2);
    });

    it("does nothing when items are empty", () => {
      suggestionActions().setItems([]);

      suggestionActions().selectNext();
      expect(getState().selectedIndex).toBe(0);

      suggestionActions().selectPrevious();
      expect(getState().selectedIndex).toBe(0);
    });

    it("gets selected item", () => {
      suggestionActions().setSelectedIndex(1);
      const item = suggestionActions().getSelectedItem();

      expect(item?.id).toBe(SUGGESTION_ITEMS[1].id);
      expect(item?.label).toBe(SUGGESTION_ITEMS[1].label);
    });

    it("returns null when no items", () => {
      suggestionActions().setItems([]);

      expect(suggestionActions().getSelectedItem()).toBeNull();
    });
  });

  describe("loading state", () => {
    it.each(["idle", "loading", "success", "error"] as const)(
      "sets loading state to %s",
      (loadingState) => {
        suggestionActions().setLoadingState(loadingState);

        expect(getState().loadingState).toBe(loadingState);
      },
    );

    it("sets error message", () => {
      const errorMessage = "Something went wrong";
      suggestionActions().setLoadingState("error", errorMessage);

      const state = getState();
      expect(state.loadingState).toBe("error");
      expect(state.error).toBe(errorMessage);
    });

    it("clears error when not provided", () => {
      suggestionActions().setLoadingState("error", "Error");
      suggestionActions().setLoadingState("success");

      expect(getState().error).toBeNull();
    });
  });

  describe("position", () => {
    it("updates position", () => {
      const newPosition = { x: 150, y: 250 };
      suggestionActions().open(TEST_SESSION_ID, "file", DEFAULT_POSITION);
      suggestionActions().updatePosition(newPosition);

      expect(getState().position).toEqual(newPosition);
    });
  });
});
