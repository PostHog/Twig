import "@features/task-detail/components/TaskInput.css";
import { ArrowUp, Paperclip, Stop } from "@phosphor-icons/react";
import { Box, Flex, IconButton, Tooltip } from "@radix-ui/themes";
import { logger } from "@renderer/lib/logger";
import type { MentionItem } from "@shared/types";
import { Extension, type JSONContent } from "@tiptap/core";
import { Mention } from "@tiptap/extension-mention";
import { Placeholder } from "@tiptap/extension-placeholder";
import {
  type Editor,
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
  type ForwardedRef,
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import { flushSync } from "react-dom";
import { useMessageDraftStore } from "../stores/messageDraftStore";

const log = logger.scope("message-editor");

interface MentionListProps {
  items: MentionItem[];
  command: (item: { id: string; label: string; type?: string }) => void;
}

interface MentionListRef {
  onKeyDown: (props: SuggestionKeyDownProps) => boolean;
}

const MentionList = forwardRef(
  (props: MentionListProps, ref: ForwardedRef<MentionListRef>) => {
    const [selectedIndex, setSelectedIndex] = useState(0);
    const [hasMouseMoved, setHasMouseMoved] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);
    const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);

    const handleMouseMove = () => {
      if (!hasMouseMoved) setHasMouseMoved(true);
    };

    const scrollIntoView = (index: number) => {
      const container = containerRef.current;
      const item = itemRefs.current[index];
      if (!container || !item) return;

      const containerTop = container.scrollTop;
      const containerBottom = containerTop + container.clientHeight;
      const itemTop = item.offsetTop;
      const itemBottom = itemTop + item.offsetHeight;

      if (itemTop < containerTop) {
        container.scrollTop = itemTop;
      } else if (itemBottom > containerBottom) {
        container.scrollTop = itemBottom - container.clientHeight;
      }
    };

    const selectItem = (index: number) => {
      const item = props.items[index];
      if (item?.path) {
        props.command({
          id: item.path,
          label: item.name || item.path.split("/").pop() || item.path,
          type: "file",
        });
      }
    };

    useEffect(() => setSelectedIndex(0), []);

    useEffect(() => {
      itemRefs.current = itemRefs.current.slice(0, props.items.length);
    }, [props.items.length]);

    useImperativeHandle(ref, () => ({
      onKeyDown: ({ event }: SuggestionKeyDownProps) => {
        if (event.key === "ArrowUp") {
          const newIndex =
            (selectedIndex + props.items.length - 1) % props.items.length;
          flushSync(() => setSelectedIndex(newIndex));
          scrollIntoView(newIndex);
          return true;
        }
        if (event.key === "ArrowDown") {
          const newIndex = (selectedIndex + 1) % props.items.length;
          flushSync(() => setSelectedIndex(newIndex));
          scrollIntoView(newIndex);
          return true;
        }
        if (event.key === "Enter") {
          selectItem(selectedIndex);
          return true;
        }
        return false;
      },
    }));

    if (props.items.length === 0) return null;

    return (
      <div
        ref={containerRef}
        role="listbox"
        onMouseMove={handleMouseMove}
        className="scrollbar-hide z-[1000] max-h-60 min-w-[300px] overflow-auto rounded font-mono text-xs shadow-xl"
        style={{
          backgroundColor: "var(--slate-1)",
          borderWidth: "1px",
          borderStyle: "solid",
          borderColor: "var(--orange-6)",
          cursor: hasMouseMoved ? undefined : "none",
        }}
      >
        {props.items.map((item, index) => {
          const isSelected = index === selectedIndex;
          return (
            <button
              type="button"
              role="option"
              aria-selected={isSelected}
              key={item.path || `item-${index}`}
              ref={(el) => {
                itemRefs.current[index] = el;
              }}
              onClick={() => selectItem(index)}
              onMouseEnter={() => hasMouseMoved && setSelectedIndex(index)}
              className="flex w-full items-center gap-1 px-2 py-0.5 text-left"
              style={{
                backgroundColor: isSelected ? "var(--orange-a3)" : undefined,
                color: isSelected ? "var(--orange-11)" : "var(--slate-11)",
                cursor: hasMouseMoved ? "pointer" : "none",
              }}
            >
              <span
                className={`overflow-hidden text-ellipsis whitespace-nowrap font-mono ${
                  isSelected ? "font-medium" : "font-normal"
                }`}
                style={{ fontSize: "12px" }}
              >
                {item.path}
              </span>
            </button>
          );
        })}
      </div>
    );
  },
);

MentionList.displayName = "MentionList";

export interface MessageEditorHandle {
  focus: () => void;
  blur: () => void;
  clear: () => void;
  isEmpty: () => boolean;
  getContent: () => JSONContent | undefined;
  getText: () => string;
}

interface MessageEditorProps {
  sessionId: string;
  placeholder?: string;
  repoPath?: string | null;
  disabled?: boolean;
  isLoading?: boolean;
  onSubmit?: (text: string) => void;
  onCancel?: () => void;
  onAttachFiles?: (files: File[]) => void;
  autoFocus?: boolean;
}

export const MessageEditor = forwardRef<
  MessageEditorHandle,
  MessageEditorProps
>(
  (
    {
      sessionId,
      placeholder = "Type a message... @ to mention files",
      repoPath,
      disabled = false,
      isLoading = false,
      onSubmit,
      onCancel,
      onAttachFiles,
      autoFocus = false,
    },
    ref,
  ) => {
    const fileInputRef = useRef<HTMLInputElement>(null);
    const { getDraft, setDraft, clearDraft, _hasHydrated } =
      useMessageDraftStore();

    const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files;
      if (files && files.length > 0) {
        for (const file of Array.from(files)) {
          editor
            ?.chain()
            .focus()
            .insertContent({
              type: "mention",
              attrs: {
                id: file.name,
                label: file.name,
                type: "file",
              },
            })
            .insertContent(" ")
            .run();
        }
        onAttachFiles?.(Array.from(files));
      }
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    };
    const [mentionItems, setMentionItems] = useState<MentionItem[]>([]);
    const mentionItemsRef = useRef(mentionItems);
    const repoPathRef = useRef(repoPath);
    const onSubmitRef = useRef(onSubmit);
    const componentRef = useRef<ReactRenderer<MentionListRef> | null>(null);
    const commandRef = useRef<
      ((item: { id: string; label: string; type?: string }) => void) | null
    >(null);

    useEffect(() => {
      mentionItemsRef.current = mentionItems;
      if (componentRef.current && commandRef.current) {
        componentRef.current.updateProps({
          items: mentionItems,
          command: commandRef.current,
        });
      }
    }, [mentionItems]);

    useEffect(() => {
      repoPathRef.current = repoPath;
    }, [repoPath]);

    useEffect(() => {
      onSubmitRef.current = onSubmit;
    }, [onSubmit]);

    const handleSubmit = () => {
      if (!editor || editor.isEmpty) return;
      const text = editor.getText();
      onSubmitRef.current?.(text);
      editor.commands.clearContent();
      clearDraft(sessionId);
    };

    const [isEmpty, setIsEmpty] = useState(true);

    const editor = useEditor({
      extensions: [
        StarterKit,
        Placeholder.configure({ placeholder }),
        Extension.create({
          name: "submitOnEnter",
          addKeyboardShortcuts() {
            return {
              Enter: () => {
                handleSubmit();
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
              id: { default: null },
              label: { default: null },
              type: { default: "file" },
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
          HTMLAttributes: { class: "cli-file-mention" },
          suggestion: {
            char: "@",
            items: async ({ query }) => {
              if (!repoPathRef.current) {
                mentionItemsRef.current = [];
                setMentionItems([]);
                if (componentRef.current && commandRef.current) {
                  componentRef.current.updateProps({
                    items: [],
                    command: commandRef.current,
                  });
                }
                return [];
              }

              mentionItemsRef.current = [];
              setMentionItems([]);

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
                mentionItemsRef.current = items;
                setMentionItems(items);
                if (componentRef.current && commandRef.current) {
                  componentRef.current.updateProps({
                    items,
                    command: commandRef.current,
                  });
                }
                return items;
              } catch (error) {
                log.error("Error fetching files:", error);
                mentionItemsRef.current = [];
                setMentionItems([]);
                if (componentRef.current && commandRef.current) {
                  componentRef.current.updateProps({
                    items: [],
                    command: commandRef.current,
                  });
                }
                return [];
              }
            },
            render: () => {
              const updatePosition = (ed: Editor, element: HTMLElement) => {
                const refRect = posToDOMRect(
                  ed.view,
                  ed.state.selection.from,
                  ed.state.selection.to,
                );
                // Anchor dropdown by its BOTTOM edge, just above the cursor
                element.style.width = "max-content";
                element.style.position = "fixed";
                element.style.left = `${refRect.left}px`;
                element.style.top = "auto";
                element.style.bottom = `${window.innerHeight - refRect.bottom}px`;
              };

              return {
                onStart: (props: SuggestionProps) => {
                  commandRef.current = props.command;

                  const component = new ReactRenderer(MentionList, {
                    props: {
                      items: mentionItemsRef.current,
                      command: props.command,
                    },
                    editor: props.editor,
                  });

                  componentRef.current = component;

                  if (!props.clientRect) return;
                  component.element.style.position = "absolute";
                  document.body.appendChild(component.element);
                  updatePosition(props.editor, component.element);
                },
                onUpdate: (props: SuggestionProps) => {
                  componentRef.current?.updateProps({
                    items: mentionItemsRef.current,
                    command: props.command,
                  });
                  if (!props.clientRect || !componentRef.current) return;
                  updatePosition(props.editor, componentRef.current.element);
                },
                onKeyDown: (props: SuggestionKeyDownProps) => {
                  if (props.event.key === "Escape") {
                    componentRef.current?.destroy();
                    componentRef.current = null;
                    commandRef.current = null;
                    return true;
                  }
                  return componentRef.current?.ref?.onKeyDown?.(props) ?? false;
                },
                onExit: () => {
                  componentRef.current?.element.remove();
                  componentRef.current?.destroy();
                  componentRef.current = null;
                  commandRef.current = null;
                },
              };
            },
          } as Partial<SuggestionOptions>,
        }),
      ],
      content: getDraft(sessionId) ?? "",
      editorProps: {
        attributes: {
          class: "cli-editor outline-none",
          spellcheck: "false",
        },
      },
      autofocus: autoFocus,
      onUpdate: ({ editor }) => {
        setIsEmpty(editor.isEmpty);
        setDraft(sessionId, editor.isEmpty ? null : editor.getJSON());
      },
    });

    useEffect(() => {
      if (editor) {
        editor.setEditable(!disabled);
      }
    }, [editor, disabled]);

    // Load draft after store hydration
    const hasLoadedDraft = useRef(false);
    useEffect(() => {
      if (_hasHydrated && editor && !hasLoadedDraft.current) {
        const draft = getDraft(sessionId);
        if (draft) {
          editor.commands.setContent(draft);
          setIsEmpty(editor.isEmpty);
        }
        hasLoadedDraft.current = true;
      }
    }, [_hasHydrated, editor, sessionId, getDraft]);

    useImperativeHandle(ref, () => ({
      focus: () => editor?.commands.focus(),
      blur: () => editor?.commands.blur(),
      clear: () => editor?.commands.clearContent(),
      isEmpty: () => editor?.isEmpty ?? true,
      getContent: () => editor?.getJSON(),
      getText: () => editor?.getText() ?? "",
    }));

    const handleContainerClick = (e: React.MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest("button")) {
        editor?.commands.focus();
      }
    };

    return (
      <Flex
        direction="column"
        gap="2"
        onClick={handleContainerClick}
        style={{ cursor: "text" }}
      >
        <Box className="max-h-[200px] min-h-[30px] flex-1 overflow-y-auto font-mono text-sm">
          <EditorContent editor={editor} />
        </Box>
        <Flex justify="between" align="center">
          <input
            ref={fileInputRef}
            type="file"
            multiple
            onChange={handleFileSelect}
            style={{ display: "none" }}
          />
          <Tooltip content="Attach file">
            <IconButton
              size="1"
              variant="ghost"
              color="gray"
              onClick={() => fileInputRef.current?.click()}
              disabled={disabled}
              title="Attach file"
              style={{ marginLeft: "0px" }}
            >
              <Paperclip size={14} weight="bold" />
            </IconButton>
          </Tooltip>
          <Flex gap="4" align="center">
            {isLoading && onCancel ? (
              <Tooltip content="Stop">
                <IconButton
                  size="1"
                  variant="soft"
                  color="red"
                  onClick={onCancel}
                  title="Stop"
                >
                  <Stop size={14} weight="fill" />
                </IconButton>
              </Tooltip>
            ) : (
              <Tooltip
                content={
                  disabled || isEmpty ? "Enter a message" : "Send message"
                }
              >
                <IconButton
                  size="1"
                  variant="solid"
                  onClick={handleSubmit}
                  disabled={disabled || isEmpty}
                  loading={isLoading}
                  style={{
                    backgroundColor:
                      disabled || isEmpty ? "var(--accent-a4)" : undefined,
                    color: disabled || isEmpty ? "var(--accent-8)" : undefined,
                  }}
                >
                  <ArrowUp size={14} weight="bold" />
                </IconButton>
              </Tooltip>
            )}
          </Flex>
        </Flex>
      </Flex>
    );
  },
);

MessageEditor.displayName = "MessageEditor";
