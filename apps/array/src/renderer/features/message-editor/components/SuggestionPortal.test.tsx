import { act, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useMessageEditorStore } from "../stores/messageEditorStore";
import { setupSuggestionTests } from "../test/helpers";
import type { SuggestionItem, SuggestionType } from "../types";
import { SuggestionPortal } from "./SuggestionPortal";

const SESSION_ID = "session-1";
const OTHER_SESSION_ID = "other-session";

const EMPTY_MESSAGES = {
  file: "No files found",
  command: "No commands available",
} as const;

const MOCK_ITEMS: SuggestionItem[] = [
  { id: "1", label: "first.ts" },
  { id: "2", label: "second.ts" },
  { id: "3", label: "third.ts" },
];

const getActions = () => useMessageEditorStore.getState().actions;
const getSelectedIndex = () =>
  useMessageEditorStore.getState().suggestion.selectedIndex;

const getListbox = () => screen.getByRole("listbox");
const getOptions = () => screen.getAllByRole("option");
const getPopup = () => document.querySelector("[data-suggestion-popup]");

function enableMouseInteraction() {
  fireEvent.mouseMove(getListbox());
}

function setupSuggestionState(
  sessionId = SESSION_ID,
  overrides: Omit<SuggestionSetup, "onSelectItem"> = {},
) {
  act(() => {
    const actions = getActions();
    actions.openSuggestion(
      sessionId,
      overrides.type ?? "file",
      overrides.position ?? { x: 100, y: 200 },
    );
    actions.setSuggestionItems(overrides.items ?? MOCK_ITEMS);
    actions.setSuggestionLoadingState(
      overrides.loadingState ?? "success",
      overrides.error,
    );
  });
}

interface SuggestionSetup {
  type?: SuggestionType;
  items?: SuggestionItem[];
  position?: { x: number; y: number };
  loadingState?: "idle" | "loading" | "success" | "error";
  error?: string;
  onSelectItem?: (item: SuggestionItem) => void;
}

function renderSuggestionPortal(
  sessionId = SESSION_ID,
  overrides: SuggestionSetup = {},
) {
  act(() => {
    const actions = getActions();
    actions.openSuggestion(
      sessionId,
      overrides.type ?? "file",
      overrides.position ?? { x: 100, y: 200 },
    );
    actions.setSuggestionItems(overrides.items ?? MOCK_ITEMS);
    actions.setSuggestionLoadingState(
      overrides.loadingState ?? "success",
      overrides.error,
    );
    if (overrides.onSelectItem) {
      actions.setOnSelectItem(overrides.onSelectItem);
    }
  });
  return render(<SuggestionPortal sessionId={sessionId} />);
}

describe("SuggestionPortal", () => {
  setupSuggestionTests();

  describe("visibility", () => {
    it("renders nothing when suggestion is not active", () => {
      const { container } = render(<SuggestionPortal sessionId={SESSION_ID} />);

      expect(container).toBeEmptyDOMElement();
    });

    it("renders nothing when active for different session", () => {
      setupSuggestionState(OTHER_SESSION_ID);

      const { container } = render(<SuggestionPortal sessionId={SESSION_ID} />);

      expect(container).toBeEmptyDOMElement();
    });

    it("renders popup when active for matching session", () => {
      setupSuggestionState(SESSION_ID);

      render(<SuggestionPortal sessionId={SESSION_ID} />);

      expect(screen.getByText("first.ts")).toBeInTheDocument();
    });
  });

  describe("positioning", () => {
    it("positions popup at specified coordinates", () => {
      renderSuggestionPortal(SESSION_ID, { position: { x: 150, y: 250 } });

      expect(getPopup()).toHaveStyle({ left: "150px", top: "250px" });
    });
  });

  // Integration: verifies portal wires up SuggestionList correctly
  describe("mouse interactions", () => {
    it("calls onSelectItem when item is clicked", () => {
      const onSelectItem = vi.fn();
      renderSuggestionPortal(SESSION_ID, { onSelectItem });

      enableMouseInteraction();
      fireEvent.click(screen.getByText("second.ts"));

      expect(onSelectItem).toHaveBeenCalledWith(MOCK_ITEMS[1]);
    });

    it("updates selectedIndex on hover", () => {
      renderSuggestionPortal(SESSION_ID);

      enableMouseInteraction();
      fireEvent.mouseEnter(getOptions()[1]);

      expect(getSelectedIndex()).toBe(1);
    });
  });

  describe("empty state", () => {
    it.each(["file", "command"] as const)(
      "shows correct empty message for %s type",
      (type) => {
        renderSuggestionPortal(SESSION_ID, {
          type,
          items: [],
          loadingState: "idle",
        });

        expect(screen.getByText(EMPTY_MESSAGES[type])).toBeInTheDocument();
      },
    );
  });

  describe("loading and error states", () => {
    it("shows loading indicator", () => {
      renderSuggestionPortal(SESSION_ID, {
        items: [],
        loadingState: "loading",
      });

      expect(screen.getByLabelText("Loading suggestions")).toBeInTheDocument();
    });

    it("shows error message", () => {
      renderSuggestionPortal(SESSION_ID, {
        items: [],
        loadingState: "error",
        error: "Network error",
      });

      expect(screen.getByText("Network error")).toBeInTheDocument();
    });
  });
});
