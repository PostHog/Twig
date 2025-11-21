import { computePosition, flip, shift } from "@floating-ui/dom";
import type { MentionItem } from "@shared/types";
import { Extension } from "@tiptap/core";
import { Mention } from "@tiptap/extension-mention";
import { Placeholder } from "@tiptap/extension-placeholder";
import {
  type Editor,
  posToDOMRect,
  ReactRenderer,
  useEditor,
} from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import type {
  SuggestionKeyDownProps,
  SuggestionOptions,
  SuggestionProps,
} from "@tiptap/suggestion";
import { useEffect, useRef, useState } from "react";
import {
  TaskFileMentionList,
  type TaskFileMentionListRef,
} from "../components/TaskFileMentionList";
import { useTaskInputStore } from "../stores/taskInputStore";

interface UseEditorSetupOptions {
  onSubmit: () => void;
  isDisabled?: boolean;
  repoPath?: string | null;
}

export function useEditorSetup({
  onSubmit,
  isDisabled = false,
  repoPath,
}: UseEditorSetupOptions): Editor | null {
  const { draft, setDraft } = useTaskInputStore();
  const [mentionItems, setMentionItems] = useState<MentionItem[]>([]);
  const mentionItemsRef = useRef(mentionItems);
  const repoPathRef = useRef(repoPath);

  // Keep refs synced
  useEffect(() => {
    mentionItemsRef.current = mentionItems;
  }, [mentionItems]);

  useEffect(() => {
    repoPathRef.current = repoPath;
  }, [repoPath]);

  const editor = useEditor({
    extensions: [
      StarterKit,
      Placeholder.configure({
        placeholder: "What do you want to work on? - @ to add context",
      }),
      Extension.create({
        name: "submitOnEnter",
        addKeyboardShortcuts() {
          return {
            "Mod-Enter": () => {
              if (!this.editor.state.selection.$from.parent.textContent) {
                return false;
              }
              onSubmit();
              return true;
            },
            Escape: () => {
              this.editor.view.dom.blur();
              return true;
            },
          };
        },
      }),
      Mention.extend({
        atom: false,
        addAttributes() {
          return {
            id: {
              default: null,
            },
            label: {
              default: null,
            },
            type: {
              default: "file",
            },
          };
        },
        renderText({
          node,
        }: {
          node: { attrs: { label?: string; id: string } };
        }) {
          return `@${node.attrs.label || node.attrs.id}`;
        },
      }).configure({
        HTMLAttributes: {
          class: "cli-file-mention",
        },
        suggestion: {
          char: "@",
          items: async ({ query }: { query: string }) => {
            if (!repoPathRef.current) {
              setMentionItems([]);
              return [];
            }

            try {
              const results = await window.electronAPI?.listRepoFiles(
                repoPathRef.current,
                query,
              );
              const items = (results || []).map((file) => ({
                path: file.path,
                name: file.name,
                type: "file" as const,
              }));
              setMentionItems(items);
              return items;
            } catch (error) {
              console.error("Error fetching files:", error);
              setMentionItems([]);
              return [];
            }
          },
          render: () => {
            let component: ReactRenderer<TaskFileMentionListRef> | null = null;

            const updatePosition = (editor: Editor, element: HTMLElement) => {
              const virtualElement = {
                getBoundingClientRect: () =>
                  posToDOMRect(
                    editor.view,
                    editor.state.selection.from,
                    editor.state.selection.to,
                  ),
              };

              computePosition(virtualElement, element, {
                placement: "bottom-start",
                strategy: "absolute",
                middleware: [shift(), flip()],
              }).then(({ x, y, strategy }) => {
                element.style.width = "max-content";
                element.style.position = strategy;
                element.style.left = `${x}px`;
                element.style.top = `${y}px`;
              });
            };

            return {
              onStart: (props: SuggestionProps) => {
                component = new ReactRenderer(TaskFileMentionList, {
                  props: {
                    items: mentionItemsRef.current,
                    command: props.command,
                  },
                  editor: props.editor,
                });

                if (!props.clientRect) {
                  return;
                }

                component.element.style.position = "absolute";
                document.body.appendChild(component.element);

                updatePosition(props.editor, component.element);
              },

              onUpdate: (props: SuggestionProps) => {
                component?.updateProps({
                  items: mentionItemsRef.current,
                  command: props.command,
                });

                if (!props.clientRect || !component) {
                  return;
                }

                updatePosition(props.editor, component.element);
              },

              onKeyDown: (props: SuggestionKeyDownProps) => {
                if (props.event.key === "Escape") {
                  component?.destroy();
                  return true;
                }

                return component?.ref?.onKeyDown?.(props) ?? false;
              },

              onExit: () => {
                component?.element.remove();
                component?.destroy();
              },
            };
          },
        } as Partial<SuggestionOptions>,
      }),
    ],
    content: draft ?? "",
    onUpdate: ({ editor: updatedEditor }) => {
      setDraft(updatedEditor.getJSON());
    },
    editorProps: {
      attributes: {
        class: "cli-editor",
        spellcheck: "false",
      },
    },
  });

  useEffect(() => {
    if (editor) {
      editor.setEditable(!isDisabled);
    }
  }, [editor, isDisabled]);

  return editor;
}
