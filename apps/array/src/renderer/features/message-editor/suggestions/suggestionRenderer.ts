import { computePosition, flip, shift } from "@floating-ui/dom";
import type { Editor } from "@tiptap/core";
import { posToDOMRect } from "@tiptap/react";
import type {
  SuggestionKeyDownProps,
  SuggestionOptions,
  SuggestionProps,
} from "@tiptap/suggestion";
import { useMessageEditorStore } from "../stores/messageEditorStore";
import type { SuggestionItem, SuggestionType } from "../types";

export interface SuggestionSourceOptions {
  onSubmit?: (text: string) => void;
}

export abstract class SuggestionSource<T extends SuggestionItem> {
  abstract readonly trigger: string;
  abstract readonly type: SuggestionType;
  readonly allowSpaces?: boolean;

  constructor(
    protected readonly sessionId: string,
    protected readonly options: SuggestionSourceOptions = {},
  ) {}

  abstract getItems(query: string): T[] | Promise<T[]>;
  abstract onSelect(
    item: T,
    command: (attrs: Record<string, unknown>) => void,
    editor: Editor,
  ): void;
}

function updatePopupPosition(
  editor: Editor,
  popupElement: HTMLElement | null,
): void {
  if (!popupElement) return;

  const virtualElement = {
    getBoundingClientRect: () =>
      posToDOMRect(
        editor.view,
        editor.state.selection.from,
        editor.state.selection.to,
      ),
  };

  computePosition(virtualElement, popupElement, {
    placement: "top-start",
    strategy: "fixed",
    middleware: [shift({ padding: 8 }), flip()],
  }).then(({ x, y }) => {
    useMessageEditorStore.getState().actions.updateSuggestionPosition({ x, y });
  });
}

function createLifecycleHandlers<T extends SuggestionItem>(
  sessionId: string,
  source: SuggestionSource<T>,
): ReturnType<NonNullable<SuggestionOptions["render"]>> {
  let currentCommand: ((attrs: Record<string, unknown>) => void) | null = null;
  let currentEditor: Editor | null = null;
  let popupElement: HTMLElement | null = null;

  const getActions = () => useMessageEditorStore.getState().actions;

  const selectItem = (item: SuggestionItem) => {
    if (!currentCommand || !currentEditor) return;
    source.onSelect(item as T, currentCommand, currentEditor);
    getActions().closeSuggestion();
  };

  return {
    onStart: (props: SuggestionProps) => {
      currentCommand = props.command;
      currentEditor = props.editor;

      const actions = getActions();
      actions.openSuggestion(sessionId, source.type, { x: 0, y: 0 });
      actions.setSuggestionItems(props.items as T[]);
      actions.setSuggestionLoadingState(
        props.items.length > 0 ? "success" : "idle",
      );
      actions.setOnSelectItem(selectItem);

      requestAnimationFrame(() => {
        popupElement = document.querySelector(
          "[data-suggestion-popup]",
        ) as HTMLElement | null;
        if (popupElement) {
          updatePopupPosition(props.editor, popupElement);
        }
      });
    },

    onUpdate: (props: SuggestionProps) => {
      currentCommand = props.command;
      currentEditor = props.editor;

      const actions = getActions();
      const currentItems = useMessageEditorStore.getState().suggestion.items;

      // Only update items if we have new results, or if this is the first update
      // This prevents flashing empty/loading states while typing
      if (props.items.length > 0 || currentItems.length === 0) {
        actions.setSuggestionItems(props.items as T[]);
        actions.setSuggestionLoadingState(
          props.items.length > 0 ? "success" : "idle",
        );
      }

      if (!popupElement) {
        popupElement = document.querySelector(
          "[data-suggestion-popup]",
        ) as HTMLElement | null;
      }
      if (popupElement) {
        updatePopupPosition(props.editor, popupElement);
      }
    },

    onKeyDown: (props: SuggestionKeyDownProps): boolean => {
      const actions = getActions();

      switch (props.event.key) {
        case "Escape":
          actions.closeSuggestion();
          return true;
        case "ArrowUp":
          actions.selectPrevious();
          return true;
        case "ArrowDown":
          actions.selectNext();
          return true;
        case "Enter": {
          const state = useMessageEditorStore.getState();
          const item = state.suggestion.items[state.suggestion.selectedIndex];
          if (item && currentCommand && currentEditor) {
            source.onSelect(item as T, currentCommand, currentEditor);
          }
          actions.closeSuggestion();
          return true;
        }
        default:
          return false;
      }
    },

    onExit: () => {
      getActions().closeSuggestion();
      currentCommand = null;
      currentEditor = null;
      popupElement = null;
    },
  };
}

export function createSuggestionOptions<T extends SuggestionItem>(
  sessionId: string,
  source: SuggestionSource<T>,
): Partial<SuggestionOptions> {
  return {
    char: source.trigger,
    allowSpaces: source.allowSpaces,
    items: async ({ query }): Promise<T[]> => {
      return source.getItems(query);
    },
    render: () => createLifecycleHandlers(sessionId, source),
  };
}
