import { getPortalContainer } from "@components/ThemeWrapper";
import Mention from "@tiptap/extension-mention";
import { ReactRenderer } from "@tiptap/react";
import type { SuggestionOptions } from "@tiptap/suggestion";
import tippy, { type Instance as TippyInstance } from "tippy.js";
import { getCommandSuggestions } from "../suggestions/getSuggestions";
import type { CommandSuggestionItem, SuggestionItem } from "../types";
import { executeClientCommand, isClientCommand } from "../utils/clientCommands";
import { SuggestionList, type SuggestionListRef } from "./SuggestionList";

function createSuggestion(
  sessionId: string,
  onSubmit?: (text: string) => void,
  onClearDraft?: () => void,
): Partial<SuggestionOptions<SuggestionItem>> {
  return {
    char: "/",
    allowSpaces: false,
    startOfLine: false,

    items: ({ query }): CommandSuggestionItem[] => {
      if (!sessionId) return [];
      return getCommandSuggestions(sessionId, query);
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

          const container = getPortalContainer();
          popup = tippy(container, {
            getReferenceClientRect: props.clientRect as () => DOMRect,
            appendTo: () => container,
            content: component.element,
            showOnCreate: true,
            interactive: true,
            trigger: "manual",
            placement: "top-start",
            offset: [0, 12],
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
      const item = props as CommandSuggestionItem;

      // Client-side commands execute locally without going to agent
      if (isClientCommand(item.command.name)) {
        executeClientCommand(item.command.name, sessionId);
        editor.chain().focus().deleteRange(range).run();
        return;
      }

      // Commands without input hints execute immediately
      if (!item.command.input?.hint) {
        editor.commands.clearContent();
        onClearDraft?.();
        onSubmit?.(`/${item.command.name}`);
        return;
      }

      // Commands with input insert a chip
      editor
        .chain()
        .focus()
        .deleteRange(range)
        .insertContent([
          {
            type: "mentionChip",
            attrs: {
              type: "command",
              id: item.id,
              label: item.label,
            },
          },
          { type: "text", text: " " },
        ])
        .run();
    },
  };
}

export interface CommandMentionOptions {
  sessionId: string;
  onSubmit?: (text: string) => void;
  onClearDraft?: () => void;
}

export function createCommandMention(options: CommandMentionOptions) {
  const { sessionId, onSubmit, onClearDraft } = options;

  return Mention.extend<CommandMentionOptions>({
    name: "commandMention",

    addOptions() {
      return {
        ...this.parent?.(),
        sessionId,
        onSubmit,
        onClearDraft,
        suggestion: createSuggestion(sessionId, onSubmit, onClearDraft),
      };
    },
  });
}
