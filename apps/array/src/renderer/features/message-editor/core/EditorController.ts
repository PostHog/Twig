import {
  contentToPlainText,
  type EditorContent,
  isContentEmpty,
  type MentionChip,
  renderContentToElement,
  serializeContent,
} from "./content";
import {
  findActiveTrigger,
  getRectAtOffset,
  type TriggerCapabilities,
  type TriggerMatch,
} from "./triggers";

export class EditorController {
  constructor(private element: HTMLDivElement) {}

  getContent(): EditorContent {
    return serializeContent(this.element);
  }

  setContent(content: EditorContent): void {
    renderContentToElement(this.element, content);
  }

  getText(): string {
    return this.element.textContent ?? "";
  }

  setText(text: string): void {
    this.element.textContent = text;
  }

  getPlainText(): string {
    return contentToPlainText(this.getContent());
  }

  isEmpty(): boolean {
    return isContentEmpty(this.getContent());
  }

  clear(): void {
    this.element.textContent = "";
  }

  focus(): void {
    this.element.focus();
  }

  blur(): void {
    this.element.blur();
  }

  moveCursorToEnd(): void {
    const selection = window.getSelection();
    if (!selection) return;

    const range = document.createRange();
    range.selectNodeContents(this.element);
    range.collapse(false);
    selection.removeAllRanges();
    selection.addRange(range);
  }

  findActiveTrigger(caps: TriggerCapabilities): TriggerMatch | null {
    return findActiveTrigger(this.element, caps);
  }

  getTriggerRect(trigger: TriggerMatch): DOMRect | null {
    return getRectAtOffset(this.element, trigger.startOffset);
  }

  insertChip(chip: MentionChip): void {
    const chipEl = this.createChipElement(chip);

    const selection = window.getSelection();
    if (selection && selection.rangeCount > 0) {
      const range = selection.getRangeAt(0);
      range.deleteContents();
      range.insertNode(chipEl);
      range.setStartAfter(chipEl);
      range.collapse(true);
      selection.removeAllRanges();
      selection.addRange(range);
    } else {
      this.element.appendChild(chipEl);
    }

    const space = document.createTextNode(" ");
    chipEl.parentNode?.insertBefore(space, chipEl.nextSibling);

    if (selection && selection.rangeCount > 0) {
      const range = selection.getRangeAt(0);
      range.setStartAfter(space);
      range.collapse(true);
      selection.removeAllRanges();
      selection.addRange(range);
    }
  }

  replaceTriggerWithChip(trigger: TriggerMatch, chip: MentionChip): void {
    const chipEl = this.createChipElement(chip);

    const walker = document.createTreeWalker(
      this.element,
      NodeFilter.SHOW_TEXT,
    );
    let currentOffset = 0;
    let targetNode: Text | null = null;
    let targetStartInNode = 0;

    while (walker.nextNode()) {
      const textNode = walker.currentNode as Text;
      const len = textNode.length;
      if (currentOffset + len > trigger.startOffset) {
        targetNode = textNode;
        targetStartInNode = trigger.startOffset - currentOffset;
        break;
      }
      currentOffset += len;
    }

    if (!targetNode) return;

    const beforeText =
      targetNode.textContent?.slice(0, targetStartInNode) ?? "";
    const afterText =
      targetNode.textContent?.slice(
        targetStartInNode + 1 + trigger.query.length,
      ) ?? "";

    const parent = targetNode.parentNode;
    if (!parent) return;

    const fragment = document.createDocumentFragment();
    if (beforeText) {
      fragment.appendChild(document.createTextNode(beforeText));
    }
    fragment.appendChild(chipEl);
    fragment.appendChild(document.createTextNode(` ${afterText}`));

    parent.replaceChild(fragment, targetNode);

    const spaceNode = chipEl.nextSibling;
    if (spaceNode) {
      const selection = window.getSelection();
      const range = document.createRange();
      range.setStart(spaceNode, 1);
      range.collapse(true);
      selection?.removeAllRanges();
      selection?.addRange(range);
    }
  }

  removeChipAtCursor(): boolean {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) return false;

    const range = selection.getRangeAt(0);
    if (!range.collapsed) return false;

    const node = range.startContainer;
    const offset = range.startOffset;

    if (node.nodeType === Node.TEXT_NODE && offset === 0) {
      const prevSibling = node.previousSibling;
      if (
        prevSibling &&
        prevSibling.nodeType === Node.ELEMENT_NODE &&
        (prevSibling as HTMLElement).classList.contains("mention-chip")
      ) {
        prevSibling.parentNode?.removeChild(prevSibling);
        return true;
      }
    }

    if (node === this.element && offset > 0) {
      const childNodes = Array.from(this.element.childNodes);
      const prevChild = childNodes[offset - 1];
      if (
        prevChild &&
        prevChild.nodeType === Node.ELEMENT_NODE &&
        (prevChild as HTMLElement).classList.contains("mention-chip")
      ) {
        prevChild.parentNode?.removeChild(prevChild);
        return true;
      }
    }

    return false;
  }

  private createChipElement(chip: MentionChip): HTMLSpanElement {
    const chipEl = document.createElement("span");
    chipEl.className = "mention-chip";
    chipEl.contentEditable = "false";
    chipEl.dataset.chipType = chip.type;
    chipEl.dataset.chipId = chip.id;
    chipEl.dataset.chipLabel = chip.label;

    if (chip.type === "file") {
      chipEl.classList.add("cli-file-mention");
      chipEl.textContent = `@${chip.label}`;
    } else if (chip.type === "command") {
      chipEl.classList.add("cli-slash-command");
      chipEl.textContent = `/${chip.label}`;
    } else {
      chipEl.classList.add("cli-file-mention");
      chipEl.textContent = `@${chip.label}`;
    }

    return chipEl;
  }
}
