import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useSuggestionStore } from "../stores/suggestionStore";
import { ARIA, EMPTY_MESSAGES, LOADING_TEXT } from "../test/constants";
import { SUGGESTION_ITEMS } from "../test/fixtures";
import {
  enableMouseInteraction,
  getListbox,
  getOptions,
  openSuggestion,
  setupSuggestionTests,
} from "../test/helpers";
import { SuggestionList } from "./SuggestionList";

const getSelectedIndex = () => useSuggestionStore.getState().selectedIndex;

describe("SuggestionList", () => {
  setupSuggestionTests();

  describe("rendering items", () => {
    it("renders all item labels and descriptions", () => {
      openSuggestion();
      render(<SuggestionList />);

      for (const item of SUGGESTION_ITEMS) {
        expect(screen.getByText(item.label)).toBeInTheDocument();
        if (item.description) {
          expect(screen.getByText(item.description)).toBeInTheDocument();
        }
      }
    });

    it("renders keyboard hints footer", () => {
      openSuggestion();
      render(<SuggestionList />);

      expect(screen.getByText(/navigate/)).toBeInTheDocument();
      expect(screen.getByText(/select/)).toBeInTheDocument();
      expect(screen.getByText(/dismiss/)).toBeInTheDocument();
    });
  });

  describe("selected item highlighting", () => {
    it("applies selected styling and aria-selected to correct item", () => {
      openSuggestion({ selectedIndex: 1 });
      render(<SuggestionList />);

      const options = getOptions();
      expect(options[0]).toHaveAttribute("aria-selected", "false");
      expect(options[0]).toHaveClass("bg-transparent");
      expect(options[1]).toHaveAttribute("aria-selected", "true");
      expect(options[1]).toHaveClass("bg-[var(--accent-a4)]");
      expect(options[2]).toHaveAttribute("aria-selected", "false");
      expect(options[2]).toHaveClass("bg-transparent");
    });
  });

  describe("empty state", () => {
    it.each(["file", "command"] as const)(
      "shows correct empty message for %s type",
      (type) => {
        openSuggestion({ type, items: [], loadingState: "idle" });
        render(<SuggestionList />);

        expect(screen.getByText(EMPTY_MESSAGES[type])).toBeInTheDocument();
      },
    );
  });

  describe("loading and error states", () => {
    it("shows loading indicator and hides items", () => {
      openSuggestion({ loadingState: "loading" });
      render(<SuggestionList />);

      expect(screen.getByText(LOADING_TEXT)).toBeInTheDocument();
      expect(screen.getByLabelText(ARIA.LOADING)).toBeInTheDocument();
      expect(
        screen.queryByText(SUGGESTION_ITEMS[0].label),
      ).not.toBeInTheDocument();
    });

    it("shows error message and hides items", () => {
      const errorMessage = "Failed to load files";
      openSuggestion({ loadingState: "error", error: errorMessage });
      render(<SuggestionList />);

      expect(screen.getByText(errorMessage)).toBeInTheDocument();
      expect(screen.getByRole("alert")).toHaveAttribute(
        "aria-label",
        ARIA.ERROR,
      );
      expect(
        screen.queryByText(SUGGESTION_ITEMS[0].label),
      ).not.toBeInTheDocument();
    });
  });

  describe("mouse interactions", () => {
    it("calls onSelectItem when clicking an item", () => {
      const onSelectItem = vi.fn();
      openSuggestion({ onSelectItem });
      render(<SuggestionList />);

      enableMouseInteraction();
      fireEvent.click(screen.getByText(SUGGESTION_ITEMS[1].label));

      expect(onSelectItem).toHaveBeenCalledWith(1);
    });

    it("updates selectedIndex on hover after mouse movement", () => {
      openSuggestion();
      render(<SuggestionList />);

      enableMouseInteraction();
      fireEvent.mouseEnter(getOptions()[1]);

      expect(getSelectedIndex()).toBe(1);
    });

    it("ignores hover before any mouse movement", () => {
      openSuggestion();
      render(<SuggestionList />);

      fireEvent.mouseEnter(getOptions()[1]);

      expect(getSelectedIndex()).toBe(0);
    });
  });

  describe("accessibility", () => {
    it("has listbox role with option children", () => {
      openSuggestion();
      render(<SuggestionList />);

      expect(getListbox()).toBeInTheDocument();
      expect(getOptions()).toHaveLength(SUGGESTION_ITEMS.length);
    });

    it.each(["file", "command"] as const)(
      "sets correct aria-label for %s type",
      (type) => {
        const ariaLabels = {
          file: ARIA.FILE_SUGGESTIONS,
          command: ARIA.COMMAND_SUGGESTIONS,
        };
        openSuggestion({ type });
        render(<SuggestionList />);

        expect(getListbox()).toHaveAttribute("aria-label", ariaLabels[type]);
      },
    );

    it("sets aria-activedescendant to selected item id", () => {
      openSuggestion({ selectedIndex: 1 });
      render(<SuggestionList />);

      expect(getListbox()).toHaveAttribute(
        "aria-activedescendant",
        `suggestion-${SUGGESTION_ITEMS[1].id}`,
      );
    });
  });
});
