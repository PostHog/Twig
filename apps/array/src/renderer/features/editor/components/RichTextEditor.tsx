import {
  MentionList,
  type MentionListRef,
} from "@features/editor/components/FileMentionList";
import { FormattingToolbar } from "@features/editor/components/FormattingToolbar";
import {
  markdownToTiptap,
  tiptapToMarkdown,
} from "@features/editor/utils/tiptap-converter";
import { computePosition, flip, shift } from "@floating-ui/dom";
import { Box } from "@radix-ui/themes";
import { logger } from "@renderer/lib/logger";
import type { MentionItem } from "@shared/types";
import type { Editor } from "@tiptap/core";
import { Link } from "@tiptap/extension-link";
import { Mention } from "@tiptap/extension-mention";
import { Placeholder } from "@tiptap/extension-placeholder";
import { Typography } from "@tiptap/extension-typography";
import { Underline } from "@tiptap/extension-underline";
import {
  EditorContent,
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
import {
  extractUrlFromMarkdown,
  isUrl,
  parsePostHogUrl,
} from "@utils/posthog-url-parser";
import { useEffect, useRef, useState } from "react";

const log = logger.scope("rich-text-editor");

interface RichTextEditorProps {
  value: string;
  onChange: (value: string) => void;
  repoPath?: string | null;
  placeholder?: string;
  autoFocus?: boolean;
  onBlur?: () => void;
  className?: string;
  style?: React.CSSProperties;
  showToolbar?: boolean;
  minHeight?: string;
  readOnly?: boolean;
}

export function RichTextEditor({
  value,
  onChange,
  repoPath,
  placeholder = "Add description...",
  autoFocus = false,
  onBlur,
  className,
  style,
  showToolbar = true,
  minHeight = "100px",
  readOnly = false,
}: RichTextEditorProps) {
  const [mentionItems, setMentionItems] = useState<MentionItem[]>([]);
  const mentionItemsRef = useRef(mentionItems);
  const onChangeRef = useRef(onChange);
  const repoPathRef = useRef(repoPath);

  // Keep refs updated
  useEffect(() => {
    mentionItemsRef.current = mentionItems;
  }, [mentionItems]);

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    repoPathRef.current = repoPath;
  }, [repoPath]);

  const editor = useEditor({
    editable: !readOnly,
    extensions: [
      StarterKit.configure({
        // Disable default keyboard shortcuts to override them
        heading: {
          levels: [1, 2, 3, 4, 5, 6],
        },
      }),
      Underline,
      Link.configure({
        openOnClick: false,
        HTMLAttributes: {
          class: "rich-text-link",
        },
      }),
      Typography,
      Placeholder.configure({
        placeholder,
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
            urlId: {
              default: null,
            },
          };
        },
        renderText({
          node,
        }: {
          node: { attrs: { label?: string; id: string } };
        }) {
          // Use the label for display, fallback to id
          return `@${node.attrs.label || node.attrs.id}`;
        },
      }).configure({
        HTMLAttributes: {
          class: "file-mention",
        },
        suggestion: {
          char: "@",
          allowSpaces: true,
          command: ({ editor, range, props }) => {
            editor
              .chain()
              .focus()
              .insertContentAt(range, [
                {
                  type: "mention",
                  attrs: {
                    id: props.id,
                    label: props.label,
                    type: props.type || "file",
                    urlId: props.urlId,
                  },
                },
                {
                  type: "text",
                  text: " ",
                },
              ])
              .run();
          },
          items: async ({ query }: { query: string }) => {
            const items: MentionItem[] = [];

            // Extract URL from markdown link syntax if present: [text](url)
            const urlToCheck = extractUrlFromMarkdown(query);

            // Check if the query looks like a URL
            if (isUrl(urlToCheck)) {
              const postHogInfo = parsePostHogUrl(urlToCheck);
              if (postHogInfo) {
                // It's a PostHog URL
                items.push({
                  url: urlToCheck,
                  type: postHogInfo.type,
                  label: postHogInfo.label,
                  id: postHogInfo.id,
                  urlId: postHogInfo.id,
                });
              } else {
                // It's a generic URL
                try {
                  const urlObj = new URL(urlToCheck);
                  items.push({
                    url: urlToCheck,
                    type: "generic",
                    label: urlObj.hostname,
                  });
                } catch {
                  // Invalid URL, ignore
                }
              }
            }

            // Only search for files if we haven't detected a URL
            if (repoPathRef.current && query.length > 0 && !isUrl(urlToCheck)) {
              try {
                const results = await window.electronAPI?.listRepoFiles(
                  repoPathRef.current,
                  query,
                );
                const fileItems = (results || []).map((file) => ({
                  path: file.path,
                  name: file.name,
                  type: "file" as const,
                }));
                items.push(...fileItems);
              } catch (error) {
                log.error("Error fetching files:", error);
              }
            }

            setMentionItems(items);
            return items;
          },
          render: () => {
            let component: ReactRenderer<MentionListRef> | null = null;

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
                component = new ReactRenderer(MentionList, {
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
    content: markdownToTiptap(value),
    onUpdate: ({ editor }) => {
      const json = editor.getJSON();
      const markdown = tiptapToMarkdown(json);
      onChangeRef.current(markdown);
    },
    onBlur,
    autofocus: autoFocus,
    editorProps: {
      attributes: {
        class: "rich-text-editor-content",
        style: `outline: none; min-height: ${minHeight}; padding: var(--space-3);`,
      },
      handlePaste: (view, event) => {
        // Check if we're in a mention context (text before cursor has @)
        const { state } = view;
        const { selection } = state;
        const { $from } = selection;

        // Get text before cursor in current paragraph
        const textBefore = $from.parent.textBetween(
          Math.max(0, $from.parentOffset - 500),
          $from.parentOffset,
          undefined,
          "\ufffc",
        );

        // Check if there's an @ symbol before the cursor without any whitespace before it
        // or if @ is the last character before cursor (just typed @)
        const lastAtIndex = textBefore.lastIndexOf("@");
        if (lastAtIndex !== -1) {
          const textAfterAt = textBefore.substring(lastAtIndex + 1);

          // We're in mention mode if:
          // 1. There's no space between @ and cursor, OR
          // 2. @ is immediately before cursor
          if (
            !textAfterAt.includes(" ") ||
            lastAtIndex === textBefore.length - 1
          ) {
            const clipboardData = event.clipboardData;
            if (clipboardData) {
              const pastedText = clipboardData.getData("text/plain").trim();

              // If pasted content is a URL, prevent default paste and insert as plain text
              if (pastedText && isUrl(pastedText)) {
                event.preventDefault();

                // Insert the URL as plain text to trigger mention suggestion
                const transaction = state.tr.insertText(pastedText);
                view.dispatch(transaction);

                return true;
              }
            }
          }
        }

        return false;
      },
      handleKeyDown: (_view, event) => {
        // Custom keyboard shortcuts
        if (event.ctrlKey || event.metaKey) {
          switch (event.key) {
            case "b":
              event.preventDefault();
              editor?.chain().focus().toggleBold().run();
              return true;
            case "i":
              event.preventDefault();
              editor?.chain().focus().toggleItalic().run();
              return true;
            case "u":
              event.preventDefault();
              editor?.chain().focus().toggleUnderline().run();
              return true;
            case "e":
              event.preventDefault();
              editor?.chain().focus().toggleCode().run();
              return true;
            case "k": {
              event.preventDefault();
              const url = window.prompt("Enter URL:");
              if (url) {
                editor?.chain().focus().setLink({ href: url }).run();
              }
              return true;
            }
          }

          if (event.shiftKey) {
            switch (event.key) {
              case "X":
                event.preventDefault();
                editor?.chain().focus().toggleStrike().run();
                return true;
              case "C": {
                event.preventDefault();
                // Use the same logic as the toolbar button
                const { from } = editor?.state.selection || { from: 0 };
                const $from = editor?.state.doc.resolve(from);
                const currentNode = $from?.parent;
                let hasMentions = false;

                if (editor?.isActive("codeBlock")) {
                  editor.chain().focus().toggleCodeBlock().run();
                } else if (currentNode?.content) {
                  currentNode.content.forEach((node) => {
                    if (node.type.name === "mention") {
                      hasMentions = true;
                    }
                  });

                  if (hasMentions) {
                    // If there are mentions, create code block on a new line after current paragraph
                    const endOfParagraph = $from?.end($from.depth) || 0;

                    editor
                      ?.chain()
                      .focus()
                      .setTextSelection(endOfParagraph)
                      .insertContent([
                        {
                          type: "codeBlock",
                          content: [{ type: "text", text: "" }],
                        },
                      ])
                      .run();
                  } else {
                    editor?.chain().focus().toggleCodeBlock().run();
                  }
                } else {
                  editor?.chain().focus().toggleCodeBlock().run();
                }
                return true;
              }
              case "B":
                event.preventDefault();
                editor?.chain().focus().toggleBlockquote().run();
                return true;
              case "*":
                event.preventDefault();
                editor?.chain().focus().toggleBulletList().run();
                return true;
              case "&": // Shift+7 = &
                event.preventDefault();
                editor?.chain().focus().toggleOrderedList().run();
                return true;
            }
          }
        }
        return false;
      },
    },
  });

  // Update editor content when value changes externally
  useEffect(() => {
    if (editor && value !== tiptapToMarkdown(editor.getJSON())) {
      const { from, to } = editor.state.selection;
      editor.commands.setContent(markdownToTiptap(value));
      // Try to restore selection
      editor.commands.setTextSelection({
        from: Math.min(from, editor.state.doc.content.size),
        to: Math.min(to, editor.state.doc.content.size),
      });
    }
  }, [value, editor]);

  return (
    <Box
      className={className}
      style={{
        border: "1px solid var(--gray-a6)",
        borderRadius: "var(--radius-2)",
        backgroundColor: "var(--color-surface)",
        ...style,
      }}
    >
      {showToolbar && editor && <FormattingToolbar editor={editor} />}
      <Box style={{ flex: 1, overflow: "auto" }}>
        <EditorContent editor={editor} />
      </Box>
      <style>
        {`
          .rich-text-file-path {
            background-color: var(--accent-a3);
            color: var(--accent-11);
            padding: 2px 4px;
            border-radius: 3px;
            font-weight: 500;
          }
        `}
      </style>
    </Box>
  );
}
