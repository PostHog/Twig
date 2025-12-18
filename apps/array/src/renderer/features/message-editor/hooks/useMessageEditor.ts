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
import {
  contentToXml,
  type EditorContent,
  isContentEmpty,
  type MentionChip,
} from "../core/content";
import { EditorController } from "../core/EditorController";
import type { TriggerMatch } from "../core/triggers";
import { useDraftStore } from "../stores/draftStore";
import { useSuggestionStore } from "../stores/suggestionStore";
import {
  getCommandSuggestions,
  getFileSuggestions,
} from "../suggestions/getSuggestions";
import type {
  CommandSuggestionItem,
  FileSuggestionItem,
  SuggestionItem,
} from "../types";

export interface EditorCapabilities {
  fileMentions?: boolean;
  commands?: boolean;
  bashMode?: boolean;
}

export interface UseMessageEditorOptions {
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

export interface UseMessageEditorReturn {
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
  onFocus: () => void;
  onCompositionStart: () => void;
  onCompositionEnd: () => void;
}

export function useMessageEditor(
  options: UseMessageEditorOptions,
): UseMessageEditorReturn {
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
  const controllerRef = useRef<EditorController | null>(null);
  const isComposingRef = useRef(false);
  const currentTriggerRef = useRef<TriggerMatch | null>(null);
  const hasRestoredDraftRef = useRef(false);
  const prevBashModeRef = useRef(false);

  const [isEmpty, setIsEmpty] = useState(true);
  const [isBashMode, setIsBashMode] = useState(false);

  const onSubmitRef = useRef(onSubmit);
  const onBashCommandRef = useRef(onBashCommand);

  const draftActions = useDraftStore((s) => s.actions);
  const draft = useDraftStore((s) => s.drafts[sessionId] ?? null);
  const hasHydrated = useDraftStore((s) => s._hasHydrated);

  const suggestionActive = useSuggestionStore((s) => s.active);
  const suggestionActions = useSuggestionStore((s) => s.actions);

  const availableCommands = useAvailableCommandsForTask(taskId);

  useLayoutEffect(() => {
    onSubmitRef.current = onSubmit;
    onBashCommandRef.current = onBashCommand;
  }, [onSubmit, onBashCommand]);

  useLayoutEffect(() => {
    draftActions.setContext(sessionId, { taskId, repoPath });
  }, [sessionId, taskId, repoPath, draftActions]);

  useLayoutEffect(() => {
    if (taskId && availableCommands.length > 0) {
      draftActions.setCommands(taskId, availableCommands);
    }
  }, [taskId, availableCommands, draftActions]);

  useEffect(() => {
    return () => {
      draftActions.removeContext(sessionId);
    };
  }, [sessionId, draftActions]);

  useLayoutEffect(() => {
    if (
      hasHydrated &&
      editorRef.current &&
      !hasRestoredDraftRef.current &&
      draft &&
      !isContentEmpty(draft)
    ) {
      hasRestoredDraftRef.current = true;
      if (!controllerRef.current) {
        controllerRef.current = new EditorController(editorRef.current);
      }
      const controller = controllerRef.current;

      if (typeof draft === "string") {
        controller.setText(draft);
        setIsEmpty(!draft);
        setIsBashMode(enableBashMode && draft.trimStart().startsWith("!"));
      } else {
        controller.setContent(draft);
        const text = controller.getPlainText();
        setIsEmpty(!text);
        setIsBashMode(enableBashMode && text.trimStart().startsWith("!"));
      }
    }
  }, [hasHydrated, draft, enableBashMode]);

  useEffect(() => {
    if (autoFocus && editorRef.current) {
      // Use controller.focus() to ensure proper cursor positioning in empty editor
      if (!controllerRef.current) {
        controllerRef.current = new EditorController(editorRef.current);
      }
      controllerRef.current.focus();
    }
  }, [autoFocus]);

  const getController = useCallback(() => {
    if (!controllerRef.current && editorRef.current) {
      controllerRef.current = new EditorController(editorRef.current);
    }
    return controllerRef.current;
  }, []);

  const closeSuggestion = useCallback(() => {
    currentTriggerRef.current = null;
    suggestionActions.close();
  }, [suggestionActions]);

  const updateSuggestionPosition = useCallback(() => {
    const controller = getController();
    const trigger = currentTriggerRef.current;
    if (!controller || !trigger) return;

    const triggerRect = controller.getTriggerRect(trigger);
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
      suggestionActions.updatePosition({ x, y });
    });
  }, [getController, suggestionActions]);

  const handleSuggestionSelect = useCallback(
    (index: number) => {
      const controller = getController();
      const trigger = currentTriggerRef.current;
      const item = useSuggestionStore.getState().items[index];
      if (!controller || !trigger || !item) return;

      if (trigger.type === "command") {
        const cmdItem = item as CommandSuggestionItem;
        if (!cmdItem.command.input?.hint) {
          controller.clear();
          setIsEmpty(true);
          draftActions.setDraft(sessionId, null);
          closeSuggestion();
          onSubmitRef.current?.(`/${cmdItem.command.name}`);
          return;
        }
      }

      const chip: MentionChip = {
        type: trigger.type,
        id: item.id,
        label:
          trigger.type === "file"
            ? ((item as FileSuggestionItem).path.split("/").pop() ??
              (item as FileSuggestionItem).path)
            : item.label,
      };

      controller.replaceTriggerWithChip(trigger, chip);
      closeSuggestion();

      const text = controller.getText();
      setIsEmpty(!text);
      const content = controller.getContent();
      draftActions.setDraft(
        sessionId,
        isContentEmpty(content) ? null : content,
      );
    },
    [getController, sessionId, draftActions, closeSuggestion],
  );

  const checkForTrigger = useCallback(async () => {
    if (isComposingRef.current) return;

    const controller = getController();
    if (!controller) return;

    const trigger = controller.findActiveTrigger({
      fileMentions: enableFileMentions,
      commands: enableCommands,
    });

    if (!trigger) {
      if (suggestionActive) {
        closeSuggestion();
      }
      return;
    }

    currentTriggerRef.current = trigger;

    if (!suggestionActive) {
      suggestionActions.open(
        sessionId,
        trigger.type,
        { x: 0, y: 0 },
        handleSuggestionSelect,
      );
    }

    try {
      let items: SuggestionItem[];
      if (trigger.type === "file") {
        items = await getFileSuggestions(sessionId, trigger.query);
      } else {
        items = getCommandSuggestions(sessionId, trigger.query);
      }

      suggestionActions.setItems(items);
      suggestionActions.setLoadingState(items.length > 0 ? "success" : "idle");
    } catch (error) {
      suggestionActions.setItems([]);
      suggestionActions.setLoadingState("error", String(error));
    }

    requestAnimationFrame(updateSuggestionPosition);
  }, [
    getController,
    sessionId,
    suggestionActive,
    suggestionActions,
    closeSuggestion,
    updateSuggestionPosition,
    enableFileMentions,
    enableCommands,
    handleSuggestionSelect,
  ]);

  const handleInput = useCallback(() => {
    const controller = getController();
    if (!controller) return;

    const text = controller.getText();
    const newIsEmpty = !text;
    const newIsBashMode = enableBashMode && text.trimStart().startsWith("!");

    setIsEmpty(newIsEmpty);
    setIsBashMode(newIsBashMode);

    if (newIsBashMode !== prevBashModeRef.current) {
      prevBashModeRef.current = newIsBashMode;
      onBashModeChange?.(newIsBashMode);
    }

    const content = controller.getContent();
    draftActions.setDraft(sessionId, isContentEmpty(content) ? null : content);

    checkForTrigger();
  }, [
    getController,
    sessionId,
    draftActions,
    checkForTrigger,
    enableBashMode,
    onBashModeChange,
  ]);

  const submit = useCallback(() => {
    const controller = getController();
    if (!controller) return;

    const text = controller.getText().trim();
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
      const content = controller.getContent();
      const xmlText = contentToXml(content);
      onSubmitRef.current?.(xmlText);
    }

    controller.clear();
    setIsEmpty(true);
    setIsBashMode(false);
    draftActions.setDraft(sessionId, null);
    closeSuggestion();
  }, [getController, sessionId, isCloud, draftActions, closeSuggestion]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (suggestionActive) {
        switch (e.key) {
          case "ArrowUp":
            e.preventDefault();
            suggestionActions.selectPrevious();
            return;
          case "ArrowDown":
            e.preventDefault();
            suggestionActions.selectNext();
            return;
          case "Enter":
          case "Tab": {
            e.preventDefault();
            const state = useSuggestionStore.getState();
            handleSuggestionSelect(state.selectedIndex);
            return;
          }
          case "Escape":
            e.preventDefault();
            e.stopPropagation();
            closeSuggestion();
            return;
        }
      }

      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        submit();
        return;
      }

      if (e.key === "Escape") {
        editorRef.current?.blur();
        return;
      }

      if (e.key === "Backspace") {
        const controller = getController();
        if (controller?.removeChipAtCursor()) {
          e.preventDefault();
          handleInput();
        }
      }
    },
    [
      suggestionActive,
      suggestionActions,
      closeSuggestion,
      handleSuggestionSelect,
      getController,
      handleInput,
      submit,
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

  const handleFocus = useCallback(() => {
    const controller = getController();
    if (controller?.isEmpty()) {
      controller.moveCursorToEnd();
    }
  }, [getController]);

  const handleSelectionChange = useCallback(() => {
    if (!isComposingRef.current) {
      checkForTrigger();
    }
  }, [checkForTrigger]);

  useEffect(() => {
    document.addEventListener("selectionchange", handleSelectionChange);
    return () => {
      document.removeEventListener("selectionchange", handleSelectionChange);
    };
  }, [handleSelectionChange]);

  const focus = useCallback(() => {
    getController()?.focus();
  }, [getController]);

  const blur = useCallback(() => {
    editorRef.current?.blur();
  }, []);

  const clear = useCallback(() => {
    const controller = getController();
    if (controller) {
      controller.clear();
      setIsEmpty(true);
      setIsBashMode(false);
      draftActions.setDraft(sessionId, null);
    }
  }, [getController, sessionId, draftActions]);

  const getText = useCallback(() => {
    return getController()?.getText() ?? "";
  }, [getController]);

  const getContent = useCallback(() => {
    return getController()?.getContent() ?? { segments: [] };
  }, [getController]);

  const setContent = useCallback(
    (text: string) => {
      const controller = getController();
      if (!controller) return;
      controller.setText(text);
      setIsEmpty(!text);
      setIsBashMode(enableBashMode && text.trimStart().startsWith("!"));
      const content = controller.getContent();
      draftActions.setDraft(
        sessionId,
        isContentEmpty(content) ? null : content,
      );
      controller.moveCursorToEnd();
      controller.focus();
    },
    [getController, sessionId, draftActions, enableBashMode],
  );

  const insertChip = useCallback(
    (chip: MentionChip) => {
      const controller = getController();
      if (!controller) return;
      controller.insertChip(chip);
      handleInput();
    },
    [getController, handleInput],
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
    onFocus: handleFocus,
    onCompositionStart: handleCompositionStart,
    onCompositionEnd: handleCompositionEnd,
  };
}
