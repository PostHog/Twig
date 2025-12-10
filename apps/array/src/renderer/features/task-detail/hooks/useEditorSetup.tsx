import { computePosition, flip, shift } from "@floating-ui/dom";
import { logger } from "@renderer/lib/logger";
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
import { useEffect, useRef } from "react";
import {
  type MentionState,
  TaskFileMentionList,
  type TaskFileMentionListRef,
} from "../components/TaskFileMentionList";
import { useTaskInputStore } from "../stores/taskInputStore";

const log = logger.scope("editor-setup");

interface UseEditorSetupOptions {
  onSubmit: () => void;
  isDisabled?: boolean;
  repoPath?: string | null;
}

interface MentionContext {
  items: MentionItem[];
  state: MentionState;
  query: string;
  directoryName?: string;
}

export function useEditorSetup({
  onSubmit,
  isDisabled = false,
  repoPath,
}: UseEditorSetupOptions): Editor | null {
  const { draft, setDraft } = useTaskInputStore();
  const mentionContextRef = useRef<MentionContext>({
    items: [],
    state: "loading",
    query: "",
    directoryName: undefined,
  });
  const repoPathRef = useRef(repoPath);
  const onSubmitRef = useRef(onSubmit);
  const componentRef = useRef<ReactRenderer<TaskFileMentionListRef> | null>(
    null,
  );
  const commandRef = useRef<
    ((item: { id: string; label: string; type?: string }) => void) | null
  >(null);

  const updateMentionContext = (context: MentionContext) => {
    mentionContextRef.current = context;
    if (componentRef.current && commandRef.current) {
      componentRef.current.updateProps({
        items: context.items,
        command: commandRef.current,
        state: context.state,
        query: context.query,
        directoryName: context.directoryName,
      });
    }
  };

  useEffect(() => {
    repoPathRef.current = repoPath;
  }, [repoPath]);

  useEffect(() => {
    onSubmitRef.current = onSubmit;
  }, [onSubmit]);

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
            Enter: () => {
              if (!this.editor.state.selection.$from.parent.textContent) {
                return false;
              }
              onSubmitRef.current();
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
            const directoryName = repoPathRef.current
              ? repoPathRef.current.split("/").pop()
              : undefined;

            if (!repoPathRef.current) {
              // Update synchronously before returning so onStart sees correct state
              mentionContextRef.current = {
                items: [],
                state: "no-directory",
                query,
                directoryName: undefined,
              };
              updateMentionContext(mentionContextRef.current);
              return [];
            }

            // Set loading state synchronously before any await
            // This ensures onStart (called after items returns or yields) sees correct initial state
            mentionContextRef.current = {
              items: [],
              state: "loading",
              query,
              directoryName,
            };

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

              updateMentionContext({
                items,
                state: items.length > 0 ? "has-results" : "no-results",
                query,
                directoryName,
              });
              return items;
            } catch (error) {
              log.error("Error fetching files:", error);
              updateMentionContext({
                items: [],
                state: "no-results",
                query,
                directoryName,
              });
              return [];
            }
          },
          render: () => {
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
                // Store command ref for use in updateMentionContext
                commandRef.current = props.command;

                const component = new ReactRenderer(TaskFileMentionList, {
                  props: {
                    items: mentionContextRef.current.items,
                    command: props.command,
                    state: mentionContextRef.current.state,
                    query: mentionContextRef.current.query,
                    directoryName: mentionContextRef.current.directoryName,
                  },
                  editor: props.editor,
                });

                // Store reference so updateMentionContext can update it
                componentRef.current = component;

                if (!props.clientRect) {
                  return;
                }

                component.element.style.position = "absolute";
                document.body.appendChild(component.element);

                updatePosition(props.editor, component.element);
              },

              onUpdate: (props: SuggestionProps) => {
                componentRef.current?.updateProps({
                  items: mentionContextRef.current.items,
                  command: props.command,
                  state: mentionContextRef.current.state,
                  query: mentionContextRef.current.query,
                  directoryName: mentionContextRef.current.directoryName,
                });

                if (!props.clientRect || !componentRef.current) {
                  return;
                }

                updatePosition(props.editor, componentRef.current.element);
              },

              onKeyDown: (props: SuggestionKeyDownProps) => {
                if (props.event.key === "Escape") {
                  componentRef.current?.destroy();
                  return true;
                }

                return componentRef.current?.ref?.onKeyDown?.(props) ?? false;
              },

              onExit: () => {
                componentRef.current?.element.remove();
                componentRef.current?.destroy();
                componentRef.current = null;
                commandRef.current = null;
                // Reset state for next time dropdown opens
                mentionContextRef.current = {
                  items: [],
                  state: "loading",
                  query: "",
                  directoryName: undefined,
                };
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
