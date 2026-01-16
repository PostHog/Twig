import { toast } from "@renderer/utils/toast";
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
  isLoading?: boolean;
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
    isLoading = false,
    isCloud = false,
    autoFocus = false,
    context,
    capabilities = {},
    onSubmit,
    onBashCommand,
    onBashModeChange,
    onEmptyChange,
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
  const [isReady, setIsReady] = useState(false);

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
            if (!view.editable) return false;
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

          const paths: { path: string; name: string }[] = [];
          for (let i = 0; i < files.length; i++) {
            const file = files[i];
            // In Electron, File objects have a 'path' property
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const path = (file as any).path;
            if (path) {
              paths.push({ path, name: file.name });
            }
          }

          if (paths.length > 0) {
            event.preventDefault();

            // Insert file mention chips for each dropped file
            const { tr } = view.state;
            const coordinates = view.posAtCoords({
              left: event.clientX,
              top: event.clientY,
            });
            let pos = coordinates ? coordinates.pos : view.state.selection.from;

            for (const { path, name } of paths) {
              const chipNode = view.state.schema.nodes.mentionChip?.create({
                type: "file",
                id: path,
                label: name,
              });
              if (chipNode) {
                tr.insert(pos, chipNode);
                pos += chipNode.nodeSize;
                // Add space after chip
                tr.insertText(" ", pos);
                pos += 1;
              }
            }

            view.dispatch(tr);
            return true;
          }

          return false;
        },
      },
      onCreate: ({ editor: e }) => {
        setIsReady(true);
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
    if (disabled || isLoading) return;

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
  }, [editor, disabled, isLoading, isCloud, draft]);

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
  };
}
