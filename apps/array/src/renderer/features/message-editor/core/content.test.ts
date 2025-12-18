import { beforeEach, describe, expect, it } from "vitest";
import {
  ALL_CHIP_TYPES,
  COMMAND_CHIP,
  CSS,
  createChip,
  createContent,
  createContentWithChip,
  FILE_CHIP,
  TRIGGERS,
} from "../test/test-utils";
import {
  contentToPlainText,
  contentToXml,
  type EditorContent,
  isContentEmpty,
  type MentionChip,
  renderContentToElement,
  serializeContent,
} from "./content";

function createChipElement(chip: MentionChip): HTMLSpanElement {
  const el = document.createElement("span");
  el.className = `${CSS.CHIP} ${chip.type === "file" ? CSS.FILE_CHIP : CSS.COMMAND_CHIP}`;
  el.dataset.chipType = chip.type;
  el.dataset.chipId = chip.id;
  el.dataset.chipLabel = chip.label;
  el.textContent =
    chip.type === "file"
      ? `${TRIGGERS.FILE}${chip.label}`
      : `${TRIGGERS.COMMAND}${chip.label}`;
  return el;
}

describe("content", () => {
  let element: HTMLDivElement;

  beforeEach(() => {
    element = document.createElement("div");
  });

  describe("serializeContent", () => {
    it("serializes plain text", () => {
      element.textContent = "hello world";
      expect(serializeContent(element)).toEqual(createContent("hello world"));
    });

    it("serializes empty element", () => {
      expect(serializeContent(element)).toEqual({ segments: [] });
    });

    it("serializes file mention chip", () => {
      element.appendChild(createChipElement(FILE_CHIP));
      expect(serializeContent(element)).toEqual({
        segments: [{ type: "chip", chip: FILE_CHIP }],
      });
    });

    it("serializes command chip", () => {
      element.appendChild(createChipElement(COMMAND_CHIP));
      expect(serializeContent(element)).toEqual({
        segments: [{ type: "chip", chip: COMMAND_CHIP }],
      });
    });

    it("serializes mixed content", () => {
      const chip = createChip({ id: "README.md", label: "README.md" });
      element.appendChild(document.createTextNode("Check "));
      element.appendChild(createChipElement(chip));
      element.appendChild(document.createTextNode(" please"));

      expect(serializeContent(element)).toEqual(
        createContentWithChip("Check ", chip, " please"),
      );
    });

    it("ignores empty text nodes", () => {
      element.appendChild(document.createTextNode(""));
      element.appendChild(document.createTextNode("hello"));
      element.appendChild(document.createTextNode(""));

      expect(serializeContent(element)).toEqual(createContent("hello"));
    });
  });

  describe("renderContentToElement", () => {
    it("renders plain text", () => {
      renderContentToElement(element, createContent("hello world"));
      expect(element.textContent).toBe("hello world");
    });

    it("renders empty content", () => {
      renderContentToElement(element, { segments: [] });
      expect(element.innerHTML).toBe("");
    });

    it("renders file chip", () => {
      renderContentToElement(element, {
        segments: [{ type: "chip", chip: FILE_CHIP }],
      });

      const chip = element.querySelector(`.${CSS.CHIP}`) as HTMLElement;
      expect(chip).not.toBeNull();
      expect(chip.classList.contains(CSS.FILE_CHIP)).toBe(true);
      expect(chip.dataset.chipType).toBe(FILE_CHIP.type);
      expect(chip.dataset.chipId).toBe(FILE_CHIP.id);
      expect(chip.textContent).toBe(`${TRIGGERS.FILE}${FILE_CHIP.label}`);
    });

    it("renders command chip", () => {
      renderContentToElement(element, {
        segments: [{ type: "chip", chip: COMMAND_CHIP }],
      });

      const chip = element.querySelector(`.${CSS.CHIP}`) as HTMLElement;
      expect(chip).not.toBeNull();
      expect(chip.classList.contains(CSS.COMMAND_CHIP)).toBe(true);
      expect(chip.textContent).toBe(`${TRIGGERS.COMMAND}${COMMAND_CHIP.label}`);
    });

    it("clears existing content before rendering", () => {
      element.innerHTML = "<p>old content</p>";
      renderContentToElement(element, createContent("new"));
      expect(element.textContent).toBe("new");
      expect(element.querySelector("p")).toBeNull();
    });

    it("round-trips serialize -> render -> serialize", () => {
      const original: EditorContent = {
        segments: [
          { type: "text", text: "Check " },
          { type: "chip", chip: FILE_CHIP },
          { type: "text", text: " and " },
          { type: "chip", chip: COMMAND_CHIP },
        ],
      };

      renderContentToElement(element, original);
      expect(serializeContent(element)).toEqual(original);
    });
  });

  describe("contentToPlainText", () => {
    it("converts text segments", () => {
      expect(contentToPlainText(createContent("hello"))).toBe("hello");
    });

    it("converts file chip to @label", () => {
      const content = createContentWithChip("", FILE_CHIP);
      expect(contentToPlainText(content)).toBe(
        `${TRIGGERS.FILE}${FILE_CHIP.label}`,
      );
    });

    it("converts command chip to /label", () => {
      const content = createContentWithChip("", COMMAND_CHIP);
      expect(contentToPlainText(content)).toBe(
        `${TRIGGERS.COMMAND}${COMMAND_CHIP.label}`,
      );
    });

    it("converts mixed content", () => {
      const buildCmd = createChip({
        type: "command",
        id: "build",
        label: "build",
      });
      const mainFile = createChip({ id: "src/main.ts", label: "main.ts" });
      const content: EditorContent = {
        segments: [
          { type: "text", text: "Run " },
          { type: "chip", chip: buildCmd },
          { type: "text", text: " on " },
          { type: "chip", chip: mainFile },
        ],
      };
      expect(contentToPlainText(content)).toBe("Run /build on @main.ts");
    });
  });

  describe("contentToXml", () => {
    it("passes through plain text", () => {
      expect(contentToXml(createContent("hello"))).toBe("hello");
    });

    it("converts file chip to XML tag with path", () => {
      const content = createContentWithChip("", FILE_CHIP);
      expect(contentToXml(content)).toBe(`<file path="${FILE_CHIP.id}" />`);
    });

    it("converts command chip to /label", () => {
      const content = createContentWithChip("", COMMAND_CHIP);
      expect(contentToXml(content)).toBe(
        `${TRIGGERS.COMMAND}${COMMAND_CHIP.label}`,
      );
    });

    it.each([
      ["error", "err-123", '<error id="err-123" />'],
      ["experiment", "exp-456", '<experiment id="exp-456" />'],
      ["insight", "ins-789", '<insight id="ins-789" />'],
      ["feature_flag", "flag-abc", '<feature_flag id="flag-abc" />'],
    ] as const)("converts %s chip to XML", (type, id, expected) => {
      const chip = createChip({ type, id, label: "label" });
      expect(contentToXml(createContentWithChip("", chip))).toBe(expected);
    });
  });

  describe("isContentEmpty", () => {
    it("returns true for null", () => {
      expect(isContentEmpty(null)).toBe(true);
    });

    it("returns true for empty segments", () => {
      expect(isContentEmpty({ segments: [] })).toBe(true);
    });

    it.each(["   ", "\n\t", "  \n  "])(
      "returns true for whitespace-only text: %j",
      (whitespace) => {
        expect(isContentEmpty(createContent(whitespace))).toBe(true);
      },
    );

    it("returns false for non-empty text", () => {
      expect(isContentEmpty(createContent("hello"))).toBe(false);
    });

    it.each(ALL_CHIP_TYPES)("returns false for %s chip", (type) => {
      const chip = createChip({ type, id: "x", label: "x" });
      expect(isContentEmpty(createContentWithChip("", chip))).toBe(false);
    });

    it("handles legacy string drafts", () => {
      expect(isContentEmpty("")).toBe(true);
      expect(isContentEmpty("   ")).toBe(true);
      expect(isContentEmpty("hello")).toBe(false);
    });

    it("handles malformed content without segments", () => {
      expect(isContentEmpty({} as EditorContent)).toBe(true);
    });
  });
});
