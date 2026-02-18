import { sessionStoreSetters } from "@features/sessions/stores/sessionStore";
import { useSettingsStore as useFeatureSettingsStore } from "@features/settings/stores/settingsStore";
import { trpcVanilla } from "@renderer/trpc/client";
import { toast } from "@renderer/utils/toast";
import { useSettingsStore } from "@stores/settingsStore";
import { useEditor } from "@tiptap/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { usePromptHistoryStore } from "../stores/promptHistoryStore";
import type { FileAttachment, MentionChip } from "../utils/content";
import { contentToXml, isContentEmpty } from "../utils/content";
import { getEditorExtensions } from "./extensions";
import { type DraftContext, useDraftSync } from "./useDraftSync";

export interface UseTiptapEditorOptions {
  sessionId: string;
  taskId?: string;
  placeholder?: string;
  disabled?: boolean;
  submitDisabled?: boolean;
  isLoading?: boolean;
  autoFocus?: boolean;
  context?: DraftContext;
  capabilities?: {
    fileMentions?: boolean;
    commands?: boolean;
    bashMode?: boolean;
  };
  clearOnSubmit?: boolean;
  onSubmit?: (text: string) => void;
  onBashCommand?: (command: string) => void;
  onBashModeChange?: (isBashMode: boolean) => void;
  onEmptyChange?: (isEmpty: boolean) => void;
  onFocus?: () => void;
  onBlur?: () => void;
}

const EDITOR_CLASS =
  "cli-editor min-h-[1.5em] w-full break-words border-none bg-transparent font-mono text-[12px] text-[var(--gray-12)] outline-none [overflow-wrap:break-word] [white-space:pre-wrap] [word-break:break-word]";

export function useTiptapEditor(options: UseTiptapEditorOptions) {
  const {
    sessionId,
    taskId,
    placeholder = "",
    disabled = false,
    submitDisabled = false,
    isLoading = false,
    autoFocus = false,
    context,
    capabilities = {},
    clearOnSubmit = true,
    onSubmit,
    onBashCommand,
    onBashModeChange,
    onEmptyChange,
    onFocus,
    onBlur,
  } = options;

  const {
    fileMentions = true,
    commands = true,
    bashMode: enableBashMode = true,
  } = capabilities;

  const callbackRefs = useRef({
    onSubmit,
    onBashCommand,
    onBashModeChange,
    onEmptyChange,
    onFocus,
    onBlur,
  });
  callbackRefs.current = {
    onSubmit,
    onBashCommand,
    onBashModeChange,
    onEmptyChange,
    onFocus,
    onBlur,
  };

  const submitDisabledRef = useRef(submitDisabled);
  submitDisabledRef.current = submitDisabled;

  const prevBashModeRef = useRef(false);
  const prevIsEmptyRef = useRef(true);
  const submitRef = useRef<() => void>(() => {});
  const draftRef = useRef<ReturnType<typeof useDraftSync> | null>(null);

  const historyActions = usePromptHistoryStore.getState();
  const [isEmptyState, setIsEmptyState] = useState(true);
  const [isReady, setIsReady] = useState(false);
  const [attachments, setAttachments] = useState<FileAttachment[]>([]);
  const attachmentsRef = useRef<FileAttachment[]>([]);

  const handleCommandSubmit = useCallback((text: string) => {
    callbackRefs.current.onSubmit?.(text);
  }, []);

  const handleClearDraft = useCallback(() => {
    draftRef.current?.clearDraft();
  }, []);

  const editor = useEditor(
    {
      extensions: getEditorExtensions({
        sessionId,
        placeholder,
        fileMentions,
        commands,
        onCommandSubmit: handleCommandSubmit,
        onClearDraft: handleClearDraft,
      }),
      editable: !disabled,
      autofocus: autoFocus ? "end" : false,
      editorProps: {
        attributes: { class: EDITOR_CLASS, spellcheck: "false" },
        handleDOMEvents: {
          click: (_view, event) => {
            const target = (event.target as HTMLElement).closest("a");
            if (target) {
              event.preventDefault();
              return true;
            }
            return false;
          },
        },
        handleKeyDown: (view, event) => {
          if (event.key === "Enter") {
            const sendMessagesWith =
              useSettingsStore.getState().sendMessagesWith;
            const isCmdEnterMode = sendMessagesWith === "cmd+enter";
            const isSubmitKey = isCmdEnterMode
              ? event.metaKey || event.ctrlKey
              : !event.shiftKey;

            if (isSubmitKey) {
              if (!view.editable || submitDisabledRef.current) return false;
              const suggestionPopup =
                document.querySelector("[data-tippy-root]");
              if (suggestionPopup) return false;
              event.preventDefault();
              historyActions.reset();
              submitRef.current();
              return true;
            }
          }

          if (
            taskId &&
            (event.key === "ArrowUp" || event.key === "ArrowDown")
          ) {
            const currentText = view.state.doc.textContent;
            const isEmpty = !currentText.trim();
            const { from } = view.state.selection;
            const isAtStart = from === 1;
            const isAtEnd = from === view.state.doc.content.size - 1;

            if (event.key === "ArrowUp" && (isEmpty || isAtStart)) {
              const queuedContent =
                sessionStoreSetters.dequeueMessagesAsText(taskId);
              if (queuedContent !== null && queuedContent !== undefined) {
                event.preventDefault();
                view.dispatch(
                  view.state.tr
                    .delete(1, view.state.doc.content.size - 1)
                    .insertText(queuedContent, 1),
                );
                return true;
              }

              const newText = historyActions.navigateUp(taskId, currentText);
              if (newText !== null) {
                event.preventDefault();
                view.dispatch(
                  view.state.tr
                    .delete(1, view.state.doc.content.size - 1)
                    .insertText(newText, 1),
                );
                return true;
              }
            }

            if (event.key === "ArrowDown" && (isEmpty || isAtEnd)) {
              const newText = historyActions.navigateDown(taskId);
              if (newText !== null) {
                event.preventDefault();
                view.dispatch(
                  view.state.tr
                    .delete(1, view.state.doc.content.size - 1)
                    .insertText(newText, 1),
                );
                return true;
              }
            }
          }

          return false;
        },
        handleDrop: (_view, event, _slice, moved) => {
          if (moved) return false;

          const files = event.dataTransfer?.files;
          if (!files || files.length === 0) return false;

          const newAttachments: FileAttachment[] = [];
          for (let i = 0; i < files.length; i++) {
            const file = files[i];
            // In Electron, File objects have a 'path' property
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const path = (file as any).path;
            if (path) {
              newAttachments.push({ id: path, label: file.name });
            }
          }

          if (newAttachments.length > 0) {
            event.preventDefault();
            setAttachments((prev) => {
              const existing = new Set(prev.map((a) => a.id));
              const unique = newAttachments.filter((a) => !existing.has(a.id));
              return unique.length > 0 ? [...prev, ...unique] : prev;
            });
            return true;
          }

          return false;
        },
        handlePaste: (_view, event) => {
          const items = event.clipboardData?.items;
          if (!items) return false;

          const imageItems: DataTransferItem[] = [];
          for (let i = 0; i < items.length; i++) {
            const item = items[i];
            if (item.type.startsWith("image/")) {
              imageItems.push(item);
            }
          }

          if (imageItems.length > 0) {
            event.preventDefault();

            (async () => {
              for (const item of imageItems) {
                const file = item.getAsFile();
                if (!file) continue;

                try {
                  const arrayBuffer = await file.arrayBuffer();
                  const base64 = btoa(
                    new Uint8Array(arrayBuffer).reduce(
                      (data, byte) => data + String.fromCharCode(byte),
                      "",
                    ),
                  );

                  const result = await trpcVanilla.os.saveClipboardImage.mutate(
                    {
                      base64Data: base64,
                      mimeType: file.type,
                      originalName: file.name,
                    },
                  );

                  setAttachments((prev) => {
                    if (prev.some((a) => a.id === result.path)) return prev;
                    return [...prev, { id: result.path, label: result.name }];
                  });
                } catch (_error) {
                  toast.error("Failed to paste image");
                }
              }
            })();

            return true;
          }

          // Auto-convert long pasted text into a file attachment
          const pastedText = event.clipboardData?.getData("text/plain");
          if (
            pastedText &&
            pastedText.length > 500 &&
            useFeatureSettingsStore.getState().autoConvertLongText
          ) {
            event.preventDefault();

            (async () => {
              try {
                const result = await trpcVanilla.os.saveClipboardText.mutate({
                  text: pastedText,
                });

                setAttachments((prev) => {
                  if (prev.some((a) => a.id === result.path)) return prev;
                  return [...prev, { id: result.path, label: result.name }];
                });
              } catch (_error) {
                toast.error("Failed to convert pasted text to attachment");
              }
            })();

            return true;
          }

          return false;
        },
      },
      onCreate: () => {
        setIsReady(true);
        const content = draftRef.current?.getContent();
        const newIsEmpty = isContentEmpty(content ?? null);
        setIsEmptyState(newIsEmpty);
        prevIsEmptyRef.current = newIsEmpty;
        callbackRefs.current.onEmptyChange?.(newIsEmpty);
      },
      onUpdate: ({ editor: e }) => {
        const text = e.getText();
        const newBashMode = enableBashMode && text.trimStart().startsWith("!");

        if (newBashMode !== prevBashModeRef.current) {
          prevBashModeRef.current = newBashMode;
          callbackRefs.current.onBashModeChange?.(newBashMode);
        }

        draftRef.current?.saveDraft(e, attachmentsRef.current);
        const content = draftRef.current?.getContent(attachmentsRef.current);
        const newIsEmpty = isContentEmpty(content ?? null);
        setIsEmptyState(newIsEmpty);

        if (newIsEmpty !== prevIsEmptyRef.current) {
          prevIsEmptyRef.current = newIsEmpty;
          callbackRefs.current.onEmptyChange?.(newIsEmpty);
        }

        e.commands.scrollIntoView();
      },
      onFocus: () => {
        callbackRefs.current.onFocus?.();
      },
      onBlur: () => {
        callbackRefs.current.onBlur?.();
      },
    },
    [sessionId, disabled, fileMentions, commands, placeholder],
  );

  const draft = useDraftSync(editor, sessionId, context);
  draftRef.current = draft;

  // Keep attachmentsRef in sync with state (synchronous, no effect needed)
  attachmentsRef.current = attachments;

  // Re-save draft when attachments change so persistence stays up to date
  useEffect(() => {
    if (editor) {
      draftRef.current?.saveDraft(editor, attachments);
    }
  }, [attachments, editor]);

  // Restore attachments from draft on mount
  useEffect(() => {
    if (draft.restoredAttachments.length > 0) {
      setAttachments(draft.restoredAttachments);
    }
    // Only run on mount / session change
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft.restoredAttachments]);

  const submit = useCallback(() => {
    if (!editor) return;
    if (disabled || submitDisabled) return;

    const content = draft.getContent(attachments);
    if (isContentEmpty(content)) return;

    const text = editor.getText().trim();

    if (text.startsWith("!")) {
      // Bash mode requires immediate execution, can't be queued
      if (isLoading) {
        toast.error("Cannot run shell commands while agent is generating");
        return;
      }
      const command = text.slice(1).trim();
      if (command) callbackRefs.current.onBashCommand?.(command);
    } else {
      // Normal prompts can be queued when loading
      callbackRefs.current.onSubmit?.(contentToXml(content));
    }

    if (clearOnSubmit) {
      editor.commands.clearContent();
      prevBashModeRef.current = false;
      setAttachments([]);
      draft.clearDraft();
    }
  }, [
    editor,
    disabled,
    submitDisabled,
    isLoading,
    draft,
    clearOnSubmit,
    attachments,
  ]);

  submitRef.current = submit;

  const focus = useCallback(() => {
    if (editor?.view) {
      editor.commands.focus("end");
    }
  }, [editor]);
  const blur = useCallback(() => editor?.commands.blur(), [editor]);
  const clear = useCallback(() => {
    editor?.commands.clearContent();
    prevBashModeRef.current = false;
    setAttachments([]);
    draft.clearDraft();
  }, [editor, draft]);
  const getText = useCallback(() => editor?.getText() ?? "", [editor]);
  const setContent = useCallback(
    (text: string) => {
      if (!editor) return;
      editor.commands.setContent(text);
      editor.commands.focus("end");
      draft.saveDraft(editor, attachments);
    },
    [editor, draft, attachments],
  );
  const insertChip = useCallback(
    (chip: MentionChip) => {
      if (!editor) return;
      editor.commands.insertMentionChip({
        type: chip.type,
        id: chip.id,
        label: chip.label,
      });
      draft.saveDraft(editor, attachments);
    },
    [editor, draft, attachments],
  );

  const addAttachment = useCallback((attachment: FileAttachment) => {
    setAttachments((prev) => {
      if (prev.some((a) => a.id === attachment.id)) return prev;
      return [...prev, attachment];
    });
  }, []);

  const removeAttachment = useCallback((id: string) => {
    setAttachments((prev) => prev.filter((a) => a.id !== id));
  }, []);

  const isEmpty = !editor || (isEmptyState && attachments.length === 0);
  const isBashMode =
    enableBashMode && (editor?.getText().trimStart().startsWith("!") ?? false);

  return {
    editor,
    isReady,
    isEmpty,
    isBashMode,
    submit,
    focus,
    blur,
    clear,
    getText,
    getContent: draft.getContent,
    setContent,
    insertChip,
    attachments,
    addAttachment,
    removeAttachment,
  };
}
