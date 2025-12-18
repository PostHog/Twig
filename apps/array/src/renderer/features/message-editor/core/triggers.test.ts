import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { CSS, TRIGGERS } from "../test/constants";
import { setCursor } from "../test/helpers";
import type { TriggerCapabilities } from "./triggers";
import { findActiveTrigger } from "./triggers";

const ALL_CAPS: TriggerCapabilities = { fileMentions: true, commands: true };
const FILE_ONLY: TriggerCapabilities = { fileMentions: true, commands: false };
const COMMAND_ONLY: TriggerCapabilities = {
  fileMentions: false,
  commands: true,
};

describe("triggers", () => {
  let element: HTMLDivElement;

  beforeEach(() => {
    element = document.createElement("div");
    element.contentEditable = "true";
    document.body.appendChild(element);
  });

  afterEach(() => {
    document.body.removeChild(element);
  });

  describe("findActiveTrigger", () => {
    describe("no trigger detected", () => {
      it("returns null when no selection", () => {
        element.textContent = `${TRIGGERS.FILE}test`;
        window.getSelection()?.removeAllRanges();
        expect(findActiveTrigger(element, ALL_CAPS)).toBeNull();
      });

      it("returns null when selection is not collapsed", () => {
        element.textContent = `${TRIGGERS.FILE}test`;
        const range = document.createRange();
        range.setStart(element.firstChild!, 0);
        range.setEnd(element.firstChild!, 5);
        window.getSelection()?.removeAllRanges();
        window.getSelection()?.addRange(range);
        expect(findActiveTrigger(element, ALL_CAPS)).toBeNull();
      });

      it("returns null when cursor is before trigger", () => {
        element.textContent = `${TRIGGERS.FILE}test`;
        setCursor(element, 0);
        expect(findActiveTrigger(element, ALL_CAPS)).toBeNull();
      });

      it("returns null when @ is in middle of word", () => {
        element.textContent = "email@example";
        setCursor(element, 13);
        expect(findActiveTrigger(element, ALL_CAPS)).toBeNull();
      });
    });

    describe("trigger detection", () => {
      it.each([
        {
          input: `${TRIGGERS.FILE}readme`,
          cursorOffset: 7,
          expected: {
            type: "file",
            trigger: TRIGGERS.FILE,
            query: "readme",
            startOffset: 0,
            endOffset: 7,
          },
        },
        {
          input: `${TRIGGERS.COMMAND}help`,
          cursorOffset: 5,
          expected: {
            type: "command",
            trigger: TRIGGERS.COMMAND,
            query: "help",
            startOffset: 0,
            endOffset: 5,
          },
        },
        {
          input: `check ${TRIGGERS.FILE}file`,
          cursorOffset: 11,
          expected: {
            type: "file",
            trigger: TRIGGERS.FILE,
            query: "file",
            startOffset: 6,
            endOffset: 11,
          },
        },
        {
          input: TRIGGERS.FILE,
          cursorOffset: 1,
          expected: {
            type: "file",
            trigger: TRIGGERS.FILE,
            query: "",
            startOffset: 0,
            endOffset: 1,
          },
        },
        {
          input: `${TRIGGERS.FILE}re`,
          cursorOffset: 3,
          expected: {
            type: "file",
            trigger: TRIGGERS.FILE,
            query: "re",
            startOffset: 0,
            endOffset: 3,
          },
        },
      ])(
        "detects trigger in '$input' at offset $cursorOffset",
        ({ input, cursorOffset, expected }) => {
          element.textContent = input;
          setCursor(element, cursorOffset);

          const trigger = findActiveTrigger(element, ALL_CAPS);
          expect(trigger).toEqual(expected);
        },
      );
    });

    describe("capability restrictions", () => {
      it("respects fileMentions capability", () => {
        element.textContent = `${TRIGGERS.FILE}test`;
        setCursor(element, 5);
        expect(findActiveTrigger(element, COMMAND_ONLY)).toBeNull();
      });

      it("respects commands capability", () => {
        element.textContent = `${TRIGGERS.COMMAND}test`;
        setCursor(element, 5);
        expect(findActiveTrigger(element, FILE_ONLY)).toBeNull();
      });
    });

    describe("query validation", () => {
      it("returns null for / trigger with spaces in query", () => {
        element.textContent = `${TRIGGERS.COMMAND}help me`;
        setCursor(element, 8);
        expect(findActiveTrigger(element, ALL_CAPS)).toBeNull();
      });

      it("returns null for @ followed by space (new word)", () => {
        element.textContent = `${TRIGGERS.FILE}file name`;
        setCursor(element, 10);
        expect(findActiveTrigger(element, ALL_CAPS)).toBeNull();
      });
    });

    describe("offset calculation with chips", () => {
      it("calculates correct offset with chips before cursor", () => {
        element.appendChild(document.createTextNode("hello "));
        const chip = document.createElement("span");
        chip.className = CSS.CHIP;
        chip.textContent = `${TRIGGERS.FILE}file`;
        element.appendChild(chip);
        element.appendChild(document.createTextNode(` ${TRIGGERS.FILE}readme`));

        const textNode = element.childNodes[2];
        const range = document.createRange();
        range.setStart(textNode, 8); // After " @readme"
        range.collapse(true);
        window.getSelection()?.removeAllRanges();
        window.getSelection()?.addRange(range);

        const trigger = findActiveTrigger(element, ALL_CAPS);
        expect(trigger).not.toBeNull();
        expect(trigger?.query).toBe("readme");
        // "hello " (6) + "@file" (5) + " " (1) = 12, then @ at 12
        expect(trigger?.startOffset).toBe(12);
      });
    });
  });
});
