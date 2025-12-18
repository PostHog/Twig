import Mention from "@tiptap/extension-mention";
import { ReactRenderer } from "@tiptap/react";
import type { SuggestionOptions } from "@tiptap/suggestion";
import tippy, { type Instance as TippyInstance } from "tippy.js";
import { getFileSuggestions } from "../suggestions/getSuggestions";
import type { FileSuggestionItem, SuggestionItem } from "../types";
import { SuggestionList, type SuggestionListRef } from "./SuggestionList";

function createSuggestion(
  sessionId: string,
): Partial<SuggestionOptions<FileSuggestionItem>> {
  return {
    char: "@",
    allowSpaces: false,
    startOfLine: false,

    items: async ({ query }): Promise<FileSuggestionItem[]> => {
      if (!sessionId) return [];
      return getFileSuggestions(sessionId, query);
    },

    render: () => {
      let component: ReactRenderer<SuggestionListRef> | null = null;
      let popup: TippyInstance | null = null;

      return {
        onStart: (props) => {
          component = new ReactRenderer(SuggestionList, {
            props: {
              items: props.items,
              command: props.command,
            },
            editor: props.editor,
          });

          if (!props.clientRect) return;

          popup = tippy(document.body, {
            getReferenceClientRect: props.clientRect as () => DOMRect,
            appendTo: () => document.body,
            content: component.element,
            showOnCreate: true,
            interactive: true,
            trigger: "manual",
            placement: "top-start",
            offset: [0, 8],
          });
        },

        onUpdate: (props) => {
          component?.updateProps({
            items: props.items,
            command: props.command,
          });

          if (props.clientRect && popup) {
            popup.setProps({
              getReferenceClientRect: props.clientRect as () => DOMRect,
            });
          }
        },

        onKeyDown: (props) => {
          if (props.event.key === "Escape") {
            popup?.hide();
            return true;
          }

          return component?.ref?.onKeyDown(props) ?? false;
        },

        onExit: () => {
          popup?.destroy();
          component?.destroy();
        },
      };
    },

    command: ({ editor, range, props }) => {
      const item = props as SuggestionItem;
      const label = item.label.split("/").pop() ?? item.label;

      editor
        .chain()
        .focus()
        .deleteRange(range)
        .insertContent([
          {
            type: "mentionChip",
            attrs: {
              type: "file",
              id: item.id,
              label,
            },
          },
          { type: "text", text: " " },
        ])
        .run();
    },
  };
}

export interface FileMentionOptions {
  sessionId: string;
}

export function createFileMention(sessionId: string) {
  return Mention.extend<FileMentionOptions>({
    name: "fileMention",

    addOptions() {
      return {
        ...this.parent?.(),
        sessionId,
        suggestion: createSuggestion(sessionId),
      };
    },
  });
}
