import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useSuggestionStore } from "../stores/suggestionStore";
import {
  ARIA,
  EMPTY_MESSAGES,
  OTHER_SESSION_ID,
  TEST_SESSION_ID,
} from "../test/constants";
import { SUGGESTION_ITEMS } from "../test/fixtures";
import {
  enableMouseInteraction,
  getOptions,
  getPopup,
  openSuggestion,
  setupSuggestionTests,
} from "../test/helpers";
import { SuggestionPortal } from "./SuggestionPortal";

const getSelectedIndex = () => useSuggestionStore.getState().selectedIndex;

describe("SuggestionPortal", () => {
  setupSuggestionTests();

  describe("visibility", () => {
    it("renders nothing when suggestion is not active", () => {
      const { container } = render(
        <SuggestionPortal sessionId={TEST_SESSION_ID} />,
      );

      expect(container).toBeEmptyDOMElement();
    });

    it("renders nothing when active for different session", () => {
      openSuggestion({ sessionId: OTHER_SESSION_ID });

      const { container } = render(
        <SuggestionPortal sessionId={TEST_SESSION_ID} />,
      );

      expect(container).toBeEmptyDOMElement();
    });

    it("renders popup when active for matching session", () => {
      openSuggestion({ sessionId: TEST_SESSION_ID });

      render(<SuggestionPortal sessionId={TEST_SESSION_ID} />);

      expect(screen.getByText(SUGGESTION_ITEMS[0].label)).toBeInTheDocument();
    });
  });

  describe("positioning", () => {
    it("positions popup at specified coordinates", () => {
      const position = { x: 150, y: 250 };
      openSuggestion({ position });

      render(<SuggestionPortal sessionId={TEST_SESSION_ID} />);

      expect(getPopup()).toHaveStyle({
        left: `${position.x}px`,
        top: `${position.y}px`,
      });
    });
  });

  describe("mouse interactions", () => {
    it("calls onSelectItem when item is clicked", () => {
      const onSelectItem = vi.fn();
      openSuggestion({ onSelectItem });

      render(<SuggestionPortal sessionId={TEST_SESSION_ID} />);

      enableMouseInteraction();
      fireEvent.click(screen.getByText(SUGGESTION_ITEMS[1].label));

      expect(onSelectItem).toHaveBeenCalledWith(1);
    });

    it("updates selectedIndex on hover", () => {
      openSuggestion();

      render(<SuggestionPortal sessionId={TEST_SESSION_ID} />);

      enableMouseInteraction();
      fireEvent.mouseEnter(getOptions()[1]);

      expect(getSelectedIndex()).toBe(1);
    });
  });

  describe("empty state", () => {
    it.each(["file", "command"] as const)(
      "shows correct empty message for %s type",
      (type) => {
        openSuggestion({ type, items: [], loadingState: "idle" });

        render(<SuggestionPortal sessionId={TEST_SESSION_ID} />);

        expect(screen.getByText(EMPTY_MESSAGES[type])).toBeInTheDocument();
      },
    );
  });

  describe("loading and error states", () => {
    it("shows loading indicator", () => {
      openSuggestion({ items: [], loadingState: "loading" });

      render(<SuggestionPortal sessionId={TEST_SESSION_ID} />);

      expect(screen.getByLabelText(ARIA.LOADING)).toBeInTheDocument();
    });

    it("shows error message", () => {
      const errorMessage = "Network error";
      openSuggestion({ items: [], loadingState: "error", error: errorMessage });

      render(<SuggestionPortal sessionId={TEST_SESSION_ID} />);

      expect(screen.getByText(errorMessage)).toBeInTheDocument();
    });
  });
});
