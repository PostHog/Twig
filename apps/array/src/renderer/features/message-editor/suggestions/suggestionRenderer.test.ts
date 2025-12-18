import { describe, expect, it } from "vitest";
import { useMessageEditorStore } from "../stores/messageEditorStore";
import {
  createKeyDownProps,
  createMockSource,
  createMockSuggestionProps,
  mockItems,
  setupSuggestionTests,
} from "../test/helpers";
import { createSuggestionOptions } from "./suggestionRenderer";

const getState = () => useMessageEditorStore.getState();
const getActions = () => getState().actions;
const getSelectedItem = () => {
  const s = getState().suggestion;
  return s.items[s.selectedIndex];
};

describe("createSuggestionOptions", () => {
  setupSuggestionTests();

  describe("options", () => {
    it("sets trigger char from source", () => {
      const source = createMockSource({ trigger: "@" });
      const options = createSuggestionOptions("session-1", source);

      expect(options.char).toBe("@");
    });

    it("sets allowSpaces from source", () => {
      const source = createMockSource({ allowSpaces: false });
      const options = createSuggestionOptions("session-1", source);

      expect(options.allowSpaces).toBe(false);
    });

    it("items function calls source.getItems", async () => {
      const source = createMockSource();
      const options = createSuggestionOptions("session-1", source);

      await options.items?.({ query: "test" } as never);

      expect(source.getItems).toHaveBeenCalledWith("test");
    });
  });

  describe("lifecycle", () => {
    it("onStart opens suggestion", () => {
      const source = createMockSource();
      const options = createSuggestionOptions("session-1", source);
      const renderer = options.render?.();

      renderer?.onStart?.(createMockSuggestionProps());

      expect(getState().suggestion.active).toBe(true);
    });

    it("onExit closes suggestion", () => {
      const source = createMockSource();
      const options = createSuggestionOptions("session-1", source);
      const renderer = options.render?.();
      const props = createMockSuggestionProps();

      renderer?.onStart?.(props);
      renderer?.onExit?.(props);

      expect(getState().suggestion.active).toBe(false);
    });
  });

  describe("keyboard navigation", () => {
    it.each([
      ["Escape", true],
      ["ArrowDown", true],
      ["ArrowUp", true],
      ["Enter", true],
      ["a", false],
      ["Tab", false],
    ])("%s key returns %s", (key, expected) => {
      const source = createMockSource();
      const options = createSuggestionOptions("session-1", source);
      const renderer = options.render?.();

      renderer?.onStart?.(createMockSuggestionProps());
      getActions().setSuggestionItems(mockItems);

      const handled = renderer?.onKeyDown?.(createKeyDownProps(key));

      expect(handled).toBe(expected);
    });

    it("Escape closes suggestion", () => {
      const source = createMockSource();
      const options = createSuggestionOptions("session-1", source);
      const renderer = options.render?.();

      renderer?.onStart?.(createMockSuggestionProps());
      renderer?.onKeyDown?.(createKeyDownProps("Escape"));

      expect(getState().suggestion.active).toBe(false);
    });

    it("ArrowDown selects next item", () => {
      const source = createMockSource();
      const options = createSuggestionOptions("session-1", source);
      const renderer = options.render?.();

      renderer?.onStart?.(createMockSuggestionProps());
      getActions().setSuggestionItems(mockItems);

      renderer?.onKeyDown?.(createKeyDownProps("ArrowDown"));

      expect(getSelectedItem()?.id).toBe("2");
    });

    it("ArrowUp selects previous item", () => {
      const source = createMockSource();
      const options = createSuggestionOptions("session-1", source);
      const renderer = options.render?.();

      renderer?.onStart?.(createMockSuggestionProps());
      getActions().setSuggestionItems(mockItems);
      getActions().setSelectedIndex(1);

      renderer?.onKeyDown?.(createKeyDownProps("ArrowUp"));

      expect(getSelectedItem()?.id).toBe("1");
    });

    it("Enter calls onSelect with selected item", () => {
      const source = createMockSource();
      const options = createSuggestionOptions("session-1", source);
      const renderer = options.render?.();
      const props = createMockSuggestionProps();

      renderer?.onStart?.(props);
      getActions().setSuggestionItems(mockItems);

      renderer?.onKeyDown?.(createKeyDownProps("Enter"));

      expect(source.onSelect).toHaveBeenCalledWith(
        mockItems[0],
        props.command,
        props.editor,
      );
    });
  });
});
