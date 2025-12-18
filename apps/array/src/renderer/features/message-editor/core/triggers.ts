import type { SuggestionType } from "../types";

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

export function getRectAtOffset(
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
