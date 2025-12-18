import type { SuggestionType } from "../types";
import {
  contentToPlainText,
  type EditorContent,
  isContentEmpty,
  type MentionChip,
  renderChipToElement,
  renderContentToElement,
  serializeContent,
} from "./content";

// =============================================================================
// Trigger Types and Functions
// =============================================================================

export interface TriggerMatch {
  type: SuggestionType;
  trigger: string;
  query: string;
  startOffset: number;
  endOffset: number;
}

export interface TriggerCapabilities {
  fileMentions: boolean;
  commands: boolean;
}

export function findActiveTrigger(
  element: HTMLDivElement,
  caps: TriggerCapabilities,
): TriggerMatch | null {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) return null;

  const range = selection.getRangeAt(0);
  if (!range.collapsed) return null;

  let node = range.startContainer;
  let offset = range.startOffset;

  // If we're in the element itself (not a text node), find the right text node
  if (node === element) {
    const childNodes = Array.from(element.childNodes);
    let currentOffset = 0;
    for (const child of childNodes) {
      const len = child.textContent?.length ?? 0;
      if (currentOffset + len >= offset) {
        if (child.nodeType === Node.TEXT_NODE) {
          node = child;
          offset = offset - currentOffset;
        }
        break;
      }
      currentOffset += len;
    }
  }

  // Must be in a text node
  if (node.nodeType !== Node.TEXT_NODE) return null;

  const textContent = node.textContent ?? "";
  const textBeforeCursor = textContent.slice(0, offset);

  // Search backwards from cursor for @ or / trigger
  for (let i = textBeforeCursor.length - 1; i >= 0; i--) {
    const char = textBeforeCursor[i];

    // Stop at whitespace - no trigger in this "word"
    if (/\s/.test(char)) break;

    const isFileTrigger = char === "@" && caps.fileMentions;
    const isCommandTrigger = char === "/" && caps.commands;

    if (isFileTrigger || isCommandTrigger) {
      // Must be at start or preceded by whitespace
      const prevChar = i > 0 ? textBeforeCursor[i - 1] : null;
      if (prevChar === null || /\s/.test(prevChar)) {
        const query = textBeforeCursor.slice(i + 1);

        // For slash commands, don't allow spaces in query
        if (char === "/" && query.includes(" ")) {
          break;
        }

        // Calculate absolute offset in the element
        let absoluteStart = i;
        let currentNode = node.previousSibling;
        while (currentNode) {
          absoluteStart += currentNode.textContent?.length ?? 0;
          currentNode = currentNode.previousSibling;
        }

        return {
          type: char === "@" ? "file" : "command",
          trigger: char,
          query,
          startOffset: absoluteStart,
          endOffset: absoluteStart + 1 + query.length,
        };
      }
    }
  }

  return null;
}

function getRectAtOffset(
  element: HTMLDivElement,
  offset: number,
): DOMRect | null {
  // Walk through text nodes to find the position
  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
  let currentOffset = 0;

  while (walker.nextNode()) {
    const textNode = walker.currentNode as Text;
    const len = textNode.length;

    if (currentOffset + len >= offset) {
      const offsetInNode = offset - currentOffset;
      const range = document.createRange();
      range.setStart(textNode, offsetInNode);
      range.collapse(true);

      const rects = range.getClientRects();
      if (rects.length > 0) {
        return rects[0];
      }

      // Fallback: use getBoundingClientRect
      const rect = range.getBoundingClientRect();
      if (rect.width !== 0 || rect.height !== 0) {
        return rect;
      }

      // Last resort: estimate position from element and line height
      const elementRect = element.getBoundingClientRect();
      const computedStyle = window.getComputedStyle(element);
      const lineHeight = Number.parseFloat(computedStyle.lineHeight) || 20;

      return new DOMRect(elementRect.left, elementRect.top, 0, lineHeight);
    }
    currentOffset += len;
  }

  // Fallback: use current selection position without DOM mutation
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) return null;

  const range = selection.getRangeAt(0);
  const rects = range.getClientRects();
  if (rects.length > 0) {
    return rects[0];
  }

  const rect = range.getBoundingClientRect();
  if (rect.width !== 0 || rect.height !== 0) {
    return rect;
  }

  // Ultimate fallback: element position
  const elementRect = element.getBoundingClientRect();
  const computedStyle = window.getComputedStyle(element);
  const lineHeight = Number.parseFloat(computedStyle.lineHeight) || 20;

  return new DOMRect(elementRect.left, elementRect.top, 0, lineHeight);
}

// =============================================================================
// EditorController
// =============================================================================

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
    this.moveCursorToEnd();
  }

  blur(): void {
    this.element.blur();
  }

  moveCursorToEnd(): void {
    const selection = window.getSelection();
    if (!selection) return;

    const range = document.createRange();
    const lastChild = this.element.lastChild;

    if (lastChild) {
      if (lastChild.nodeType === Node.TEXT_NODE) {
        range.setStart(lastChild, (lastChild as Text).length);
      } else {
        range.setStartAfter(lastChild);
      }
    } else {
      // Empty element - explicitly set cursor at position 0
      range.setStart(this.element, 0);
    }

    range.collapse(true);
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

    // Always append to the end of the editor content
    this.element.appendChild(chipEl);

    const space = document.createTextNode(" ");
    this.element.appendChild(space);

    // Move cursor after the space
    const selection = window.getSelection();
    const newRange = document.createRange();
    newRange.setStartAfter(space);
    newRange.collapse(true);
    selection?.removeAllRanges();
    selection?.addRange(newRange);

    // Ensure editor has focus
    this.element.focus();
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
    return renderChipToElement(chip);
  }
}
