import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { CSS, TRIGGERS } from "../test/constants";
import {
  COMMAND_CHIP,
  createChip,
  createContent,
  createContentWithChip,
  createTrigger,
  FILE_CHIP,
} from "../test/fixtures";
import { setCursor } from "../test/helpers";
import type { EditorContent } from "./content";
import { EditorController } from "./EditorController";
import type { TriggerCapabilities } from "./triggers";

const ALL_CAPS: TriggerCapabilities = { fileMentions: true, commands: true };
const COMMAND_ONLY: TriggerCapabilities = {
  fileMentions: false,
  commands: true,
};

describe("EditorController", () => {
  let element: HTMLDivElement;
  let controller: EditorController;

  beforeEach(() => {
    element = document.createElement("div");
    element.contentEditable = "true";
    document.body.appendChild(element);
    controller = new EditorController(element);
  });

  afterEach(() => {
    document.body.removeChild(element);
  });

  describe("getText / setText", () => {
    it("gets empty text from empty element", () => {
      expect(controller.getText()).toBe("");
    });

    it("gets text content", () => {
      element.textContent = "hello world";
      expect(controller.getText()).toBe("hello world");
    });

    it("sets text content", () => {
      controller.setText("hello world");
      expect(element.textContent).toBe("hello world");
    });

    it("replaces existing content", () => {
      element.textContent = "old";
      controller.setText("new");
      expect(element.textContent).toBe("new");
    });
  });

  describe("getContent / setContent", () => {
    it("gets empty content from empty element", () => {
      expect(controller.getContent()).toEqual({ segments: [] });
    });

    it("gets plain text content", () => {
      element.textContent = "hello";
      expect(controller.getContent()).toEqual(createContent("hello"));
    });

    it("sets plain text content", () => {
      controller.setContent(createContent("hello"));
      expect(element.textContent).toBe("hello");
    });

    it("sets content with chips", () => {
      controller.setContent(
        createContentWithChip("Check ", FILE_CHIP, " please"),
      );
      expect(element.textContent).toBe(
        `Check ${TRIGGERS.FILE}${FILE_CHIP.label} please`,
      );
      expect(element.querySelector(`.${CSS.CHIP}`)).not.toBeNull();
    });

    it("round-trips content with chips", () => {
      const original: EditorContent = {
        segments: [
          { type: "text", text: "Run " },
          { type: "chip", chip: COMMAND_CHIP },
        ],
      };
      controller.setContent(original);
      expect(controller.getContent()).toEqual(original);
    });
  });

  describe("getPlainText", () => {
    it("converts chips to plain text representation", () => {
      controller.setContent(createContentWithChip("Check ", FILE_CHIP));
      expect(controller.getPlainText()).toBe(
        `Check ${TRIGGERS.FILE}${FILE_CHIP.label}`,
      );
    });
  });

  describe("isEmpty", () => {
    it.each([
      { desc: "empty element", content: "", expected: true },
      { desc: "whitespace-only", content: "   ", expected: true },
      { desc: "text content", content: "hello", expected: false },
    ])("returns $expected for $desc", ({ content, expected }) => {
      element.textContent = content;
      expect(controller.isEmpty()).toBe(expected);
    });

    it("returns false for chip content", () => {
      controller.setContent(createContentWithChip("", createChip()));
      expect(controller.isEmpty()).toBe(false);
    });
  });

  describe("clear", () => {
    it("clears text content", () => {
      element.textContent = "hello";
      controller.clear();
      expect(element.textContent).toBe("");
    });

    it("clears chips", () => {
      controller.setContent(createContentWithChip("", createChip()));
      controller.clear();
      expect(element.innerHTML).toBe("");
    });
  });

  describe("moveCursorToEnd", () => {
    it("moves cursor to end of content", () => {
      element.textContent = "hello";
      setCursor(element, 0);
      controller.moveCursorToEnd();

      const selection = window.getSelection();
      const range = selection?.getRangeAt(0);
      expect(range?.collapsed).toBe(true);
    });
  });

  describe("insertChip", () => {
    it.each([
      {
        chipType: "file" as const,
        expectedPrefix: TRIGGERS.FILE,
        expectedClass: CSS.FILE_CHIP,
      },
      {
        chipType: "command" as const,
        expectedPrefix: TRIGGERS.COMMAND,
        expectedClass: CSS.COMMAND_CHIP,
      },
    ])(
      "inserts $chipType chip with $expectedPrefix prefix",
      ({ chipType, expectedPrefix, expectedClass }) => {
        // Set up empty element with cursor at position 0
        element.textContent = "";
        element.focus();
        const range = document.createRange();
        range.setStart(element, 0);
        range.collapse(true);
        window.getSelection()?.removeAllRanges();
        window.getSelection()?.addRange(range);

        const chip = createChip({ type: chipType, id: "test", label: "test" });
        controller.insertChip(chip);

        const chipEl = element.querySelector(`.${CSS.CHIP}`) as HTMLElement;
        expect(chipEl).not.toBeNull();
        expect(chipEl.textContent).toBe(`${expectedPrefix}test`);
        expect(chipEl.classList.contains(expectedClass)).toBe(true);
      },
    );

    it("inserts chip at cursor position", () => {
      element.textContent = "hello world";
      setCursor(element, 6);

      controller.insertChip(FILE_CHIP);

      expect(element.querySelector(`.${CSS.CHIP}`)).not.toBeNull();
      expect(element.textContent).toContain(
        `${TRIGGERS.FILE}${FILE_CHIP.label}`,
      );
    });

    it("inserts chip at end when no selection", () => {
      element.textContent = "hello";
      window.getSelection()?.removeAllRanges();

      controller.insertChip(FILE_CHIP);

      expect(element.textContent).toBe(
        `hello${TRIGGERS.FILE}${FILE_CHIP.label} `,
      );
    });

    it("adds space after chip", () => {
      element.textContent = "";
      controller.insertChip(FILE_CHIP);

      expect(element.textContent).toBe(`${TRIGGERS.FILE}${FILE_CHIP.label} `);
    });
  });

  describe("replaceTriggerWithChip", () => {
    it("replaces trigger text with chip", () => {
      element.textContent = `check ${TRIGGERS.FILE}readme please`;
      setCursor(element, 13);

      const trigger = createTrigger({
        query: "readme",
        startOffset: 6,
        endOffset: 13,
      });
      const chip = createChip({ id: "README.md", label: "README.md" });

      controller.replaceTriggerWithChip(trigger, chip);

      expect(element.querySelector(`.${CSS.CHIP}`)).not.toBeNull();
      expect(element.textContent).toContain(`${TRIGGERS.FILE}README.md`);
    });

    it("replaces trigger at start of text", () => {
      element.textContent = `${TRIGGERS.FILE}test`;

      const trigger = createTrigger({
        query: "test",
        startOffset: 0,
        endOffset: 5,
      });
      const chip = createChip({ id: "test.ts", label: "test.ts" });

      controller.replaceTriggerWithChip(trigger, chip);

      const chipEl = element.querySelector(`.${CSS.CHIP}`) as HTMLElement;
      expect(chipEl.textContent).toBe(`${TRIGGERS.FILE}test.ts`);
    });
  });

  describe("removeChipAtCursor", () => {
    it("removes chip when cursor is right after it", () => {
      controller.setContent({
        segments: [
          { type: "chip", chip: createChip() },
          { type: "text", text: "after" },
        ],
      });

      const textNode = element.childNodes[1];
      const range = document.createRange();
      range.setStart(textNode, 0);
      range.collapse(true);
      window.getSelection()?.removeAllRanges();
      window.getSelection()?.addRange(range);

      expect(controller.removeChipAtCursor()).toBe(true);
      expect(element.querySelector(`.${CSS.CHIP}`)).toBeNull();
    });

    it("returns false when no chip to remove", () => {
      element.textContent = "hello world";
      setCursor(element, 5);

      expect(controller.removeChipAtCursor()).toBe(false);
    });

    it("returns false when selection is not collapsed", () => {
      element.textContent = "hello";
      const range = document.createRange();
      range.setStart(element.firstChild!, 0);
      range.setEnd(element.firstChild!, 5);
      window.getSelection()?.removeAllRanges();
      window.getSelection()?.addRange(range);

      expect(controller.removeChipAtCursor()).toBe(false);
    });
  });

  describe("findActiveTrigger", () => {
    it.each([
      {
        input: `${TRIGGERS.FILE}readme`,
        offset: 7,
        type: "file",
        query: "readme",
      },
      {
        input: `${TRIGGERS.COMMAND}help`,
        offset: 5,
        type: "command",
        query: "help",
      },
    ])("finds $type trigger in '$input'", ({ input, offset, type, query }) => {
      element.textContent = input;
      setCursor(element, offset);

      const trigger = controller.findActiveTrigger(ALL_CAPS);

      expect(trigger).not.toBeNull();
      expect(trigger?.type).toBe(type);
      expect(trigger?.query).toBe(query);
    });

    it("respects capabilities", () => {
      element.textContent = `${TRIGGERS.FILE}test`;
      setCursor(element, 5);

      expect(controller.findActiveTrigger(COMMAND_ONLY)).toBeNull();
    });
  });
});
