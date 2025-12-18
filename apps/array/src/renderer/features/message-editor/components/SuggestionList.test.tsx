import { act, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useMessageEditorStore } from "../stores/messageEditorStore";
import { setupSuggestionTests } from "../test/helpers";
import type { SuggestionItem, SuggestionType } from "../types";
import { SuggestionList } from "./SuggestionList";

const SESSION_ID = "session-1";
const SELECTED_CLASS = "suggestion-item-selected";

const ARIA_LABELS = {
  file: "File suggestions",
  command: "Available commands",
} as const;

const EMPTY_MESSAGES = {
  file: "No files found",
  command: "No commands available",
} as const;

const MOCK_ITEMS: SuggestionItem[] = [
  { id: "1", label: "file1.ts", description: "src/file1.ts" },
  { id: "2", label: "file2.ts", description: "src/file2.ts" },
  { id: "3", label: "file3.ts" },
];

const getActions = () => useMessageEditorStore.getState().actions;
const getSelectedIndex = () =>
  useMessageEditorStore.getState().suggestion.selectedIndex;

const getListbox = () => screen.getByRole("listbox");
const getOptions = () => screen.getAllByRole("option");

interface SuggestionSetup {
  items?: SuggestionItem[];
  selectedIndex?: number;
  type?: SuggestionType;
  loadingState?: "idle" | "loading" | "success" | "error";
  error?: string;
  onSelectItem?: (item: SuggestionItem) => void;
}

function renderSuggestionList(overrides: SuggestionSetup = {}) {
  act(() => {
    const actions = getActions();
    actions.openSuggestion(SESSION_ID, overrides.type ?? "file", {
      x: 0,
      y: 0,
    });
    actions.setSuggestionItems(overrides.items ?? MOCK_ITEMS);
    if (overrides.selectedIndex !== undefined) {
      actions.setSelectedIndex(overrides.selectedIndex);
    }
    actions.setSuggestionLoadingState(
      overrides.loadingState ?? "success",
      overrides.error,
    );
    if (overrides.onSelectItem) {
      actions.setOnSelectItem(overrides.onSelectItem);
    }
  });
  return render(<SuggestionList />);
}

function enableMouseInteraction() {
  fireEvent.mouseMove(getListbox());
}

describe("SuggestionList", () => {
  setupSuggestionTests();

  describe("rendering items", () => {
    it("renders all item labels and descriptions", () => {
      renderSuggestionList();

      expect(screen.getByText("file1.ts")).toBeInTheDocument();
      expect(screen.getByText("file2.ts")).toBeInTheDocument();
      expect(screen.getByText("file3.ts")).toBeInTheDocument();
      expect(screen.getByText("src/file1.ts")).toBeInTheDocument();
      expect(screen.getByText("src/file2.ts")).toBeInTheDocument();
    });

    it("renders keyboard hints footer", () => {
      renderSuggestionList();

      expect(screen.getByText(/navigate/)).toBeInTheDocument();
      expect(screen.getByText(/select/)).toBeInTheDocument();
      expect(screen.getByText(/dismiss/)).toBeInTheDocument();
    });
  });

  describe("selected item highlighting", () => {
    it("applies selected class and aria-selected to correct item", () => {
      renderSuggestionList({ selectedIndex: 1 });

      const options = getOptions();
      expect(options[0]).not.toHaveClass(SELECTED_CLASS);
      expect(options[0]).toHaveAttribute("aria-selected", "false");
      expect(options[1]).toHaveClass(SELECTED_CLASS);
      expect(options[1]).toHaveAttribute("aria-selected", "true");
      expect(options[2]).not.toHaveClass(SELECTED_CLASS);
      expect(options[2]).toHaveAttribute("aria-selected", "false");
    });
  });

  describe("empty state", () => {
    it.each(["file", "command"] as const)(
      "shows correct empty message for %s type",
      (type) => {
        renderSuggestionList({ items: [], type, loadingState: "idle" });

        expect(screen.getByText(EMPTY_MESSAGES[type])).toBeInTheDocument();
      },
    );
  });

  describe("loading and error states", () => {
    it("shows loading indicator and hides items", () => {
      renderSuggestionList({ loadingState: "loading" });

      expect(screen.getByText("Searching...")).toBeInTheDocument();
      expect(screen.getByLabelText("Loading suggestions")).toBeInTheDocument();
      expect(screen.queryByText("file1.ts")).not.toBeInTheDocument();
    });

    it("shows error message and hides items", () => {
      const errorMessage = "Failed to load files";
      renderSuggestionList({ loadingState: "error", error: errorMessage });

      expect(screen.getByText(errorMessage)).toBeInTheDocument();
      expect(screen.getByRole("alert")).toHaveAttribute(
        "aria-label",
        "Error loading suggestions",
      );
      expect(screen.queryByText("file1.ts")).not.toBeInTheDocument();
    });
  });

  describe("mouse interactions", () => {
    it("calls onSelectItem when clicking an item", () => {
      const onSelectItem = vi.fn();
      renderSuggestionList({ onSelectItem });

      enableMouseInteraction();
      fireEvent.click(screen.getByText("file2.ts"));

      expect(onSelectItem).toHaveBeenCalledWith(MOCK_ITEMS[1]);
    });

    it("updates selectedIndex on hover after mouse movement", () => {
      renderSuggestionList();

      enableMouseInteraction();
      fireEvent.mouseEnter(getOptions()[1]);

      expect(getSelectedIndex()).toBe(1);
    });

    it("ignores hover before any mouse movement", () => {
      renderSuggestionList();

      fireEvent.mouseEnter(getOptions()[1]);

      expect(getSelectedIndex()).toBe(0);
    });
  });

  describe("accessibility", () => {
    it("has listbox role with option children", () => {
      renderSuggestionList();

      expect(getListbox()).toBeInTheDocument();
      expect(getOptions()).toHaveLength(3);
    });

    it.each(["file", "command"] as const)(
      "sets correct aria-label for %s type",
      (type) => {
        renderSuggestionList({ type });

        expect(getListbox()).toHaveAttribute("aria-label", ARIA_LABELS[type]);
      },
    );

    it("sets aria-activedescendant to selected item id", () => {
      renderSuggestionList({ selectedIndex: 1 });

      expect(getListbox()).toHaveAttribute(
        "aria-activedescendant",
        "suggestion-2",
      );
    });
  });
});
