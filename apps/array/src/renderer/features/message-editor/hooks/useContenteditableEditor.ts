import { useAvailableCommandsForTask } from "@features/sessions/stores/sessionStore";
import { computePosition, flip, shift } from "@floating-ui/dom";
import { toast } from "@renderer/utils/toast";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { useMessageEditorStore } from "../stores/messageEditorStore";
import {
  getCommandSuggestions,
  getFileSuggestions,
} from "../suggestions/getSuggestions";
import type {
  CommandSuggestionItem,
  FileSuggestionItem,
  SuggestionItem,
  SuggestionType,
} from "../types";

export interface MentionChip {
  type:
    | "file"
    | "command"
    | "error"
    | "experiment"
    | "insight"
    | "feature_flag";
  id: string;
  label: string;
}

export interface EditorContent {
  segments: Array<
    { type: "text"; text: string } | { type: "chip"; chip: MentionChip }
  >;
}

export interface EditorCapabilities {
  /** Enable @file mentions (default: true) */
  fileMentions?: boolean;
  /** Enable /command suggestions (default: true) */
  commands?: boolean;
  /** Enable !bash mode (default: true) */
  bashMode?: boolean;
}

export interface UseContenteditableEditorOptions {
  sessionId: string;
  taskId?: string;
  placeholder?: string;
  repoPath?: string | null;
  disabled?: boolean;
  isCloud?: boolean;
  capabilities?: EditorCapabilities;
  onSubmit?: (text: string) => void;
  onBashCommand?: (command: string) => void;
  onBashModeChange?: (isBashMode: boolean) => void;
  autoFocus?: boolean;
}

export interface UseContenteditableEditorReturn {
  editorRef: React.RefObject<HTMLDivElement>;
  isEmpty: boolean;
  isBashMode: boolean;
  submit: () => void;
  focus: () => void;
  blur: () => void;
  clear: () => void;
  getText: () => string;
  getContent: () => EditorContent;
  setContent: (text: string) => void;
  insertChip: (chip: MentionChip) => void;
  onInput: () => void;
  onKeyDown: (e: React.KeyboardEvent<HTMLDivElement>) => void;
  onPaste: (e: React.ClipboardEvent<HTMLDivElement>) => void;
  onCompositionStart: () => void;
  onCompositionEnd: () => void;
}

interface TriggerMatch {
  type: SuggestionType;
  trigger: string;
  query: string;
  startOffset: number;
  endOffset: number;
}

interface TriggerCapabilities {
  fileMentions: boolean;
  commands: boolean;
}

function findActiveTrigger(
  element: HTMLDivElement,
  caps: TriggerCapabilities,
): TriggerMatch | null {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) return null;

  const range = selection.getRangeAt(0);
  if (!range.collapsed) return null;

  // Get the text node and offset within it
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

  // Look for @ or / trigger (must be at word boundary)
  // Search backwards from cursor
  for (let i = textBeforeCursor.length - 1; i >= 0; i--) {
    const char = textBeforeCursor[i];

    // Stop at whitespace - no trigger in this "word"
    if (/\s/.test(char)) break;

    // Check for triggers (respecting capabilities)
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
  // Save current selection to restore after measuring
  const selection = window.getSelection();
  const savedRange = selection?.rangeCount
    ? selection.getRangeAt(0).cloneRange()
    : null;

  // Walk through nodes to find the position at the given offset
  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
  let currentOffset = 0;

  while (walker.nextNode()) {
    const textNode = walker.currentNode as Text;
    const len = textNode.length;

    if (currentOffset + len >= offset) {
      // Found the text node containing our offset
      const offsetInNode = offset - currentOffset;
      const range = document.createRange();
      range.setStart(textNode, offsetInNode);
      range.collapse(true);

      // Use range.getBoundingClientRect() directly instead of inserting a span
      // This avoids DOM mutations that can corrupt the editor content
      let rect = range.getBoundingClientRect();

      // If rect has zero dimensions (collapsed range at line start),
      // we need to insert a temporary element
      if (rect.width === 0 && rect.height === 0) {
        const span = document.createElement("span");
        span.textContent = "\u200B"; // Zero-width space
        range.insertNode(span);
        rect = span.getBoundingClientRect();
        span.parentNode?.removeChild(span);
        element.normalize();

        // Restore selection after DOM mutation
        if (savedRange && selection) {
          selection.removeAllRanges();
          selection.addRange(savedRange);
        }
      }

      return rect;
    }
    currentOffset += len;
  }

  // Fallback: get caret rect if offset not found
  if (!selection || selection.rangeCount === 0) return null;

  const range = selection.getRangeAt(0).cloneRange();
  range.collapse(true);

  let rect = range.getBoundingClientRect();
  if (rect.width === 0 && rect.height === 0) {
    const span = document.createElement("span");
    span.textContent = "\u200B";
    range.insertNode(span);
    rect = span.getBoundingClientRect();
    span.parentNode?.removeChild(span);
    element.normalize();

    // Restore selection
    if (savedRange && selection) {
      selection.removeAllRanges();
      selection.addRange(savedRange);
    }
  }

  return rect;
}

function serializeContent(element: HTMLDivElement): EditorContent {
  const segments: EditorContent["segments"] = [];

  for (const node of element.childNodes) {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent ?? "";
      if (text) {
        segments.push({ type: "text", text });
      }
    } else if (node.nodeType === Node.ELEMENT_NODE) {
      const el = node as HTMLElement;
      if (el.classList.contains("mention-chip")) {
        const chipType = el.dataset.chipType as MentionChip["type"];
        const chipId = el.dataset.chipId ?? "";
        const chipLabel = el.dataset.chipLabel ?? el.textContent ?? "";
        segments.push({
          type: "chip",
          chip: { type: chipType, id: chipId, label: chipLabel },
        });
      } else {
        // For any other element, just get text content
        const text = el.textContent ?? "";
        if (text) {
          segments.push({ type: "text", text });
        }
      }
    }
  }

  return { segments };
}

function renderContentToElement(
  element: HTMLDivElement,
  content: EditorContent,
): void {
  element.innerHTML = "";

  for (const segment of content.segments) {
    if (segment.type === "text") {
      element.appendChild(document.createTextNode(segment.text));
    } else {
      const chip = segment.chip;
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

      element.appendChild(chipEl);
    }
  }
}

function contentToPlainText(content: EditorContent): string {
  return content.segments
    .map((seg) => {
      if (seg.type === "text") return seg.text;
      const chip = seg.chip;
      if (chip.type === "file") return `@${chip.label}`;
      if (chip.type === "command") return `/${chip.label}`;
      return `@${chip.label}`;
    })
    .join("");
}

function isContentEmpty(content: EditorContent | null | string): boolean {
  if (!content) return true;
  // Handle legacy string drafts from old persisted data
  if (typeof content === "string") return !content.trim();
  if (!content.segments) return true;
  return content.segments.every(
    (seg) => seg.type === "text" && !seg.text.trim(),
  );
}

function contentToXml(content: EditorContent): string {
  return content.segments
    .map((seg) => {
      if (seg.type === "text") return seg.text;
      // Convert chip to XML tag
      const chip = seg.chip;
      switch (chip.type) {
        case "file":
          return `<file path="${chip.id}" />`;
        case "command":
          return `/${chip.label}`;
        case "error":
          return `<error id="${chip.id}" />`;
        case "experiment":
          return `<experiment id="${chip.id}" />`;
        case "insight":
          return `<insight id="${chip.id}" />`;
        case "feature_flag":
          return `<feature_flag id="${chip.id}" />`;
        default:
          return `@${chip.label}`;
      }
    })
    .join("");
}

export function useContenteditableEditor(
  options: UseContenteditableEditorOptions,
): UseContenteditableEditorReturn {
  const {
    sessionId,
    taskId,
    repoPath,
    autoFocus = false,
    isCloud = false,
    capabilities = {},
    onSubmit,
    onBashCommand,
    onBashModeChange,
  } = options;

  const {
    fileMentions: enableFileMentions = true,
    commands: enableCommands = true,
    bashMode: enableBashMode = true,
  } = capabilities;

  const editorRef = useRef<HTMLDivElement>(null);
  const [isEmpty, setIsEmpty] = useState(true);
  const [isBashMode, setIsBashMode] = useState(false);
  const isComposingRef = useRef(false);
  const currentTriggerRef = useRef<TriggerMatch | null>(null);

  const onSubmitRef = useRef(onSubmit);
  const onBashCommandRef = useRef(onBashCommand);
  const prevBashModeRef = useRef(false);
  const submitRef = useRef<(() => void) | null>(null);

  const actions = useMessageEditorStore((s) => s.actions);
  const draft = useMessageEditorStore((s) => s.drafts[sessionId] ?? null);
  const hasHydrated = useMessageEditorStore((s) => s._hasHydrated);
  const suggestionActive = useMessageEditorStore((s) => s.suggestion.active);
  const availableCommands = useAvailableCommandsForTask(taskId);
  const hasRestoredDraftRef = useRef(false);

  // Keep refs up to date
  useLayoutEffect(() => {
    onSubmitRef.current = onSubmit;
  }, [onSubmit]);

  useLayoutEffect(() => {
    onBashCommandRef.current = onBashCommand;
  }, [onBashCommand]);

  // Set context in store
  useLayoutEffect(() => {
    actions.setContext(sessionId, { taskId, repoPath });
  }, [sessionId, taskId, repoPath, actions]);

  // Set commands
  useLayoutEffect(() => {
    if (taskId && availableCommands.length > 0) {
      actions.setCommands(taskId, availableCommands);
    }
  }, [taskId, availableCommands, actions]);

  // Handle bash mode change callback
  useEffect(() => {
    if (isBashMode !== prevBashModeRef.current) {
      prevBashModeRef.current = isBashMode;
      onBashModeChange?.(isBashMode);
    }
  }, [isBashMode, onBashModeChange]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      actions.removeContext(sessionId);
    };
  }, [sessionId, actions]);

  // Restore draft on hydration (only once on initial mount)
  useLayoutEffect(() => {
    if (
      hasHydrated &&
      editorRef.current &&
      !hasRestoredDraftRef.current &&
      draft &&
      !isContentEmpty(draft)
    ) {
      hasRestoredDraftRef.current = true;
      // Handle legacy string drafts from old persisted data
      if (typeof draft === "string") {
        editorRef.current.textContent = draft;
        setIsEmpty(!draft);
        setIsBashMode(enableBashMode && draft.trimStart().startsWith("!"));
        return;
      }
      // Render the full content structure with chips
      renderContentToElement(editorRef.current, draft);
      const plainText = contentToPlainText(draft);
      setIsEmpty(!plainText);
      setIsBashMode(enableBashMode && plainText.trimStart().startsWith("!"));
    }
  }, [hasHydrated, draft, enableBashMode]);

  // Auto focus
  useEffect(() => {
    if (autoFocus && editorRef.current) {
      editorRef.current.focus();
    }
  }, [autoFocus]);

  const updateSuggestionPosition = useCallback(() => {
    const element = editorRef.current;
    const trigger = currentTriggerRef.current;
    if (!element || !trigger) return;

    // Get rect at the trigger character position (@ or /)
    const triggerRect = getRectAtOffset(element, trigger.startOffset);
    if (!triggerRect) return;

    const virtualElement = {
      getBoundingClientRect: () => triggerRect,
    };

    const popup = document.querySelector(
      "[data-suggestion-popup]",
    ) as HTMLElement | null;
    if (!popup) return;

    computePosition(virtualElement, popup, {
      placement: "top-start",
      strategy: "fixed",
      middleware: [shift({ padding: 8 }), flip()],
    }).then(({ x, y }) => {
      actions.updateSuggestionPosition({ x, y });
    });
  }, [actions]);

  const closeSuggestion = useCallback(() => {
    currentTriggerRef.current = null;
    actions.closeSuggestion();
  }, [actions]);

  const handleSuggestionSelect = useCallback(
    (item: SuggestionItem) => {
      const element = editorRef.current;
      const trigger = currentTriggerRef.current;
      if (!element || !trigger) return;

      // For commands without input hint, submit immediately
      if (trigger.type === "command") {
        const cmdItem = item as CommandSuggestionItem;
        if (!cmdItem.command.input?.hint) {
          element.textContent = "";
          setIsEmpty(true);
          actions.setDraft(sessionId, null);
          closeSuggestion();
          onSubmitRef.current?.(`/${cmdItem.command.name}`);
          return;
        }
      }

      // Create the chip element
      const chip = document.createElement("span");
      chip.className = "mention-chip";
      chip.contentEditable = "false";
      chip.dataset.chipType = trigger.type;
      chip.dataset.chipId = item.id;
      chip.dataset.chipLabel = item.label;

      if (trigger.type === "file") {
        chip.classList.add("cli-file-mention");
        const fileItem = item as FileSuggestionItem;
        const label = fileItem.path.split("/").pop() ?? fileItem.path;
        chip.textContent = `@${label}`;
        chip.dataset.chipLabel = label;
      } else {
        chip.classList.add("cli-slash-command");
        chip.textContent = `/${item.label}`;
      }

      // Find and replace the trigger text with the chip
      // We need to walk through the DOM to find the right position
      const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
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

      if (targetNode) {
        const beforeText =
          targetNode.textContent?.slice(0, targetStartInNode) ?? "";
        const afterText =
          targetNode.textContent?.slice(
            targetStartInNode + 1 + trigger.query.length,
          ) ?? "";

        // Create new structure
        const parent = targetNode.parentNode;
        if (parent) {
          const fragment = document.createDocumentFragment();
          if (beforeText) {
            fragment.appendChild(document.createTextNode(beforeText));
          }
          fragment.appendChild(chip);
          // Add a space after the chip
          fragment.appendChild(document.createTextNode(` ${afterText}`));

          parent.replaceChild(fragment, targetNode);

          // Move cursor after the space
          const spaceNode = chip.nextSibling;
          if (spaceNode) {
            const selection = window.getSelection();
            const range = document.createRange();
            range.setStart(spaceNode, 1);
            range.collapse(true);
            selection?.removeAllRanges();
            selection?.addRange(range);
          }
        }
      }

      closeSuggestion();

      // Update state with full content structure
      const text = element.textContent ?? "";
      setIsEmpty(!text);
      const content = serializeContent(element);
      actions.setDraft(sessionId, isContentEmpty(content) ? null : content);
    },
    [sessionId, actions, closeSuggestion],
  );

  const checkForTrigger = useCallback(async () => {
    if (isComposingRef.current) return;

    const element = editorRef.current;
    if (!element) return;

    const trigger = findActiveTrigger(element, {
      fileMentions: enableFileMentions,
      commands: enableCommands,
    });

    if (!trigger) {
      if (suggestionActive) {
        closeSuggestion();
      }
      return;
    }

    // Store current trigger for selection handling
    currentTriggerRef.current = trigger;

    // Open suggestion if not already open
    if (!suggestionActive) {
      actions.openSuggestion(sessionId, trigger.type, { x: 0, y: 0 });
      actions.setOnSelectItem(handleSuggestionSelect);
      actions.setTriggerExit(closeSuggestion);
    }

    // Fetch items - don't show loading state, keep previous results visible
    try {
      let items: SuggestionItem[] = [];

      if (trigger.type === "file") {
        items = await getFileSuggestions(sessionId, trigger.query);
      } else {
        items = getCommandSuggestions(sessionId, trigger.query);
      }

      // Only update if we have results, or if this is the first fetch (no items yet)
      const currentItems = useMessageEditorStore.getState().suggestion.items;
      if (items.length > 0 || currentItems.length === 0) {
        actions.setSuggestionItems(items);
        actions.setSuggestionLoadingState(
          items.length > 0 ? "success" : "idle",
        );
      }
    } catch (error) {
      // Only show error if we have no items to display
      const currentItems = useMessageEditorStore.getState().suggestion.items;
      if (currentItems.length === 0) {
        actions.setSuggestionLoadingState("error", String(error));
      }
    }

    // Update position after items are set
    requestAnimationFrame(updateSuggestionPosition);
  }, [
    sessionId,
    suggestionActive,
    actions,
    closeSuggestion,
    handleSuggestionSelect,
    updateSuggestionPosition,
    enableFileMentions,
    enableCommands,
  ]);

  const handleInput = useCallback(() => {
    const element = editorRef.current;
    if (!element) return;

    const text = element.textContent ?? "";
    setIsEmpty(!text);
    setIsBashMode(enableBashMode && text.trimStart().startsWith("!"));

    // Save draft with full content structure (including chips)
    const content = serializeContent(element);
    actions.setDraft(sessionId, isContentEmpty(content) ? null : content);

    // Check for triggers
    checkForTrigger();
  }, [sessionId, actions, checkForTrigger, enableBashMode]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      // Handle suggestion keyboard navigation
      if (suggestionActive) {
        switch (e.key) {
          case "ArrowUp":
            e.preventDefault();
            actions.selectPrevious();
            return;
          case "ArrowDown":
            e.preventDefault();
            actions.selectNext();
            return;
          case "Enter": {
            e.preventDefault();
            const state = useMessageEditorStore.getState();
            const item = state.suggestion.items[state.suggestion.selectedIndex];
            if (item) {
              handleSuggestionSelect(item);
            }
            return;
          }
          case "Escape":
            e.preventDefault();
            closeSuggestion();
            return;
          case "Tab": {
            e.preventDefault();
            const state = useMessageEditorStore.getState();
            const item = state.suggestion.items[state.suggestion.selectedIndex];
            if (item) {
              handleSuggestionSelect(item);
            }
            return;
          }
        }
      }

      // Handle Enter for submit
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        submitRef.current?.();
        return;
      }

      // Handle Escape to blur
      if (e.key === "Escape") {
        editorRef.current?.blur();
        return;
      }

      // Handle backspace at chip boundary
      if (e.key === "Backspace") {
        const selection = window.getSelection();
        if (selection && selection.rangeCount > 0) {
          const range = selection.getRangeAt(0);
          if (range.collapsed) {
            const node = range.startContainer;
            const offset = range.startOffset;

            // Check if we're at the start of a text node after a chip
            if (node.nodeType === Node.TEXT_NODE && offset === 0) {
              const prevSibling = node.previousSibling;
              if (
                prevSibling &&
                prevSibling.nodeType === Node.ELEMENT_NODE &&
                (prevSibling as HTMLElement).classList.contains("mention-chip")
              ) {
                e.preventDefault();
                prevSibling.parentNode?.removeChild(prevSibling);
                handleInput();
                return;
              }
            }

            // Check if we're at position 0 in the editor and previous element is a chip
            if (node === editorRef.current && offset > 0) {
              const childNodes = Array.from(editorRef.current.childNodes);
              const prevChild = childNodes[offset - 1];
              if (
                prevChild &&
                prevChild.nodeType === Node.ELEMENT_NODE &&
                (prevChild as HTMLElement).classList.contains("mention-chip")
              ) {
                e.preventDefault();
                prevChild.parentNode?.removeChild(prevChild);
                handleInput();
                return;
              }
            }
          }
        }
      }
    },
    [
      suggestionActive,
      actions,
      closeSuggestion,
      handleSuggestionSelect,
      handleInput,
    ],
  );

  const handlePaste = useCallback((e: React.ClipboardEvent<HTMLDivElement>) => {
    e.preventDefault();
    const text = e.clipboardData.getData("text/plain");
    document.execCommand("insertText", false, text);
  }, []);

  const handleCompositionStart = useCallback(() => {
    isComposingRef.current = true;
  }, []);

  const handleCompositionEnd = useCallback(() => {
    isComposingRef.current = false;
    checkForTrigger();
  }, [checkForTrigger]);

  const handleSelectionChange = useCallback(() => {
    // Re-check trigger on selection change (cursor movement)
    if (!isComposingRef.current) {
      checkForTrigger();
    }
  }, [checkForTrigger]);

  // Set up selection change listener
  useEffect(() => {
    document.addEventListener("selectionchange", handleSelectionChange);
    return () => {
      document.removeEventListener("selectionchange", handleSelectionChange);
    };
  }, [handleSelectionChange]);

  const submit = useCallback(() => {
    const element = editorRef.current;
    if (!element) return;

    const text = element.textContent?.trim() ?? "";
    if (!text) return;

    if (text.startsWith("!")) {
      if (isCloud) {
        toast.error("Bash mode is not supported in cloud sessions");
        return;
      }
      const command = text.slice(1).trim();
      if (command) {
        onBashCommandRef.current?.(command);
      }
    } else {
      // Get content with chips and convert to XML for submission
      const content = serializeContent(element);
      const xmlText = contentToXml(content);
      onSubmitRef.current?.(xmlText);
    }

    // Clear editor
    element.textContent = "";
    setIsEmpty(true);
    setIsBashMode(false);
    actions.setDraft(sessionId, null);
    closeSuggestion();
  }, [sessionId, isCloud, actions, closeSuggestion]);

  // Keep submitRef updated
  useLayoutEffect(() => {
    submitRef.current = submit;
  }, [submit]);

  const focus = useCallback(() => {
    editorRef.current?.focus();
  }, []);

  const blur = useCallback(() => {
    editorRef.current?.blur();
  }, []);

  const clear = useCallback(() => {
    if (editorRef.current) {
      editorRef.current.textContent = "";
      setIsEmpty(true);
      setIsBashMode(false);
      actions.setDraft(sessionId, null);
    }
  }, [sessionId, actions]);

  const getText = useCallback(() => {
    return editorRef.current?.textContent ?? "";
  }, []);

  const getContent = useCallback(() => {
    if (!editorRef.current) {
      return { segments: [] };
    }
    return serializeContent(editorRef.current);
  }, []);

  const setContent = useCallback(
    (text: string) => {
      if (!editorRef.current) return;
      editorRef.current.textContent = text;
      setIsEmpty(!text);
      setIsBashMode(enableBashMode && text.trimStart().startsWith("!"));
      // Save draft with full content structure
      const content = serializeContent(editorRef.current);
      actions.setDraft(sessionId, isContentEmpty(content) ? null : content);
      // Move cursor to end
      const selection = window.getSelection();
      if (selection && editorRef.current.childNodes.length > 0) {
        const range = document.createRange();
        range.selectNodeContents(editorRef.current);
        range.collapse(false);
        selection.removeAllRanges();
        selection.addRange(range);
      }
      editorRef.current.focus();
    },
    [sessionId, actions, enableBashMode],
  );

  const insertChip = useCallback(
    (chip: MentionChip) => {
      const element = editorRef.current;
      if (!element) return;

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

      // Insert at cursor or end
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
        element.appendChild(chipEl);
      }

      // Add space after
      const space = document.createTextNode(" ");
      chipEl.parentNode?.insertBefore(space, chipEl.nextSibling);

      handleInput();
    },
    [handleInput],
  );

  return {
    editorRef,
    isEmpty,
    isBashMode,
    submit,
    focus,
    blur,
    clear,
    getText,
    getContent,
    setContent,
    insertChip,
    onInput: handleInput,
    onKeyDown: handleKeyDown,
    onPaste: handlePaste,
    onCompositionStart: handleCompositionStart,
    onCompositionEnd: handleCompositionEnd,
  };
}
