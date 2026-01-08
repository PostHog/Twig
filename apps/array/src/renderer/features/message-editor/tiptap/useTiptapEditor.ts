import { toast } from "@renderer/utils/toast";
import { useConnectivityStore } from "@stores/connectivityStore";
import { useEditor } from "@tiptap/react";
import { useCallback, useRef, useState } from "react";
import { usePromptHistoryStore } from "../stores/promptHistoryStore";
import type { MentionChip } from "../utils/content";
import { contentToXml } from "../utils/content";
import { getEditorExtensions } from "./extensions";
import { type DraftContext, useDraftSync } from "./useDraftSync";

export interface UseTiptapEditorOptions {
  sessionId: string;
  taskId?: string;
  placeholder?: string;
  disabled?: boolean;
  isCloud?: boolean;
  autoFocus?: boolean;
  context?: DraftContext;
  capabilities?: {
    fileMentions?: boolean;
    commands?: boolean;
    bashMode?: boolean;
  };
  onSubmit?: (text: string) => void;
  onBashCommand?: (command: string) => void;
  onBashModeChange?: (isBashMode: boolean) => void;
  onEmptyChange?: (isEmpty: boolean) => void;
}

const EDITOR_CLASS =
  "cli-editor min-h-[1.5em] w-full break-words border-none bg-transparent font-mono text-[12px] text-[var(--gray-12)] outline-none [overflow-wrap:break-word] [white-space:pre-wrap] [word-break:break-word]";

export function useTiptapEditor(options: UseTiptapEditorOptions) {
  const {
    sessionId,
    taskId,
    placeholder = "",
    disabled = false,
    isCloud = false,
    autoFocus = false,
    context,
    capabilities = {},
    onSubmit,
    onBashCommand,
    onBashModeChange,
    onEmptyChange,
  } = options;

  const isOffline = useConnectivityStore((s) => !s.isOnline);

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
  });
  callbackRefs.current = {
    onSubmit,
    onBashCommand,
    onBashModeChange,
    onEmptyChange,
  };

  const prevBashModeRef = useRef(false);
  const prevIsEmptyRef = useRef(true);
  const submitRef = useRef<() => void>(() => {});
  const draftRef = useRef<ReturnType<typeof useDraftSync> | null>(null);

  const historyActions = usePromptHistoryStore.getState();
  const [isEmptyState, setIsEmptyState] = useState(true);

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
        attributes: { class: EDITOR_CLASS },
        handleKeyDown: (view, event) => {
          if (event.key === "Enter" && !event.shiftKey) {
            const suggestionPopup = document.querySelector("[data-tippy-root]");
            if (suggestionPopup) return false;
            event.preventDefault();
            historyActions.reset();
            submitRef.current();
            return true;
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
        handleDrop: (view, event, _slice, moved) => {
          if (moved) return false;

          const files = event.dataTransfer?.files;
          if (!files || files.length === 0) return false;

          const paths: string[] = [];
          for (let i = 0; i < files.length; i++) {
            const file = files[i];
            // In Electron, File objects have a 'path' property
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const path = (file as any).path;
            if (path) {
              paths.push(path);
            }
          }

          if (paths.length > 0) {
            event.preventDefault();

            const coordinates = view.posAtCoords({
              left: event.clientX,
              top: event.clientY,
            });
            const pos = coordinates
              ? coordinates.pos
              : view.state.selection.from;

            const textToInsert = paths.map((p) => `"${p}"`).join(" ");

            view.dispatch(view.state.tr.insertText(`${textToInsert} `, pos));
            return true;
          }

          return false;
        },
      },
      onCreate: ({ editor: e }) => {
        const newIsEmpty = !e.getText().trim();
        setIsEmptyState(newIsEmpty);
        prevIsEmptyRef.current = newIsEmpty;
        callbackRefs.current.onEmptyChange?.(newIsEmpty);
      },
      onUpdate: ({ editor: e }) => {
        const text = e.getText();
        const trimmedText = text.trim();
        const newBashMode = enableBashMode && text.trimStart().startsWith("!");

        if (newBashMode !== prevBashModeRef.current) {
          prevBashModeRef.current = newBashMode;
          callbackRefs.current.onBashModeChange?.(newBashMode);
        }

        const newIsEmpty = !trimmedText;
        setIsEmptyState(newIsEmpty);

        if (newIsEmpty !== prevIsEmptyRef.current) {
          prevIsEmptyRef.current = newIsEmpty;
          callbackRefs.current.onEmptyChange?.(newIsEmpty);
        }

        draftRef.current?.saveDraft(e);
      },
    },
    [sessionId, disabled, fileMentions, commands, placeholder],
  );

  const draft = useDraftSync(editor, sessionId, context);
  draftRef.current = draft;

  const submit = useCallback(() => {
    if (!editor) return;
    if (isOffline) return;

    const text = editor.getText().trim();
    if (!text) return;

    if (text.startsWith("!")) {
      if (isCloud) {
        toast.error("Bash mode is not supported in cloud sessions");
        return;
      }
      const command = text.slice(1).trim();
      if (command) callbackRefs.current.onBashCommand?.(command);
    } else {
      const content = draft.getContent();
      callbackRefs.current.onSubmit?.(contentToXml(content));
    }

    editor.commands.clearContent();
    prevBashModeRef.current = false;
    draft.clearDraft();
  }, [editor, isCloud, isOffline, draft]);

  submitRef.current = submit;

  const focus = useCallback(() => editor?.commands.focus("end"), [editor]);
  const blur = useCallback(() => editor?.commands.blur(), [editor]);
  const clear = useCallback(() => {
    editor?.commands.clearContent();
    prevBashModeRef.current = false;
    draft.clearDraft();
  }, [editor, draft]);
  const getText = useCallback(() => editor?.getText() ?? "", [editor]);
  const setContent = useCallback(
    (text: string) => {
      if (!editor) return;
      editor.commands.setContent(text);
      editor.commands.focus("end");
      draft.saveDraft(editor);
    },
    [editor, draft],
  );
  const insertChip = useCallback(
    (chip: MentionChip) => {
      if (!editor) return;
      editor.commands.insertMentionChip({
        type: chip.type,
        id: chip.id,
        label: chip.label,
      });
      draft.saveDraft(editor);
    },
    [editor, draft],
  );

  const isEmpty = !editor || isEmptyState;
  const isBashMode =
    enableBashMode && (editor?.getText().trimStart().startsWith("!") ?? false);

  return {
    editor,
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
  };
}
