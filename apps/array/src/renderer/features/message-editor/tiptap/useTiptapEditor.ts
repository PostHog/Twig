import { toast } from "@renderer/utils/toast";
import { useEditor } from "@tiptap/react";
import { useCallback, useRef } from "react";
import type { MentionChip } from "../utils/content";
import { contentToXml } from "../utils/content";
import { getEditorExtensions } from "./extensions";
import { type DraftContext, useDraftSync } from "./useDraftSync";

export interface UseTiptapEditorOptions {
  sessionId: string;
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
}

const EDITOR_CLASS =
  "cli-editor min-h-[1.5em] w-full break-words border-none bg-transparent font-mono text-[12px] text-[var(--gray-12)] outline-none [overflow-wrap:break-word] [white-space:pre-wrap] [word-break:break-word]";

export function useTiptapEditor(options: UseTiptapEditorOptions) {
  const {
    sessionId,
    placeholder = "",
    disabled = false,
    isCloud = false,
    autoFocus = false,
    context,
    capabilities = {},
    onSubmit,
    onBashCommand,
    onBashModeChange,
  } = options;

  const {
    fileMentions = true,
    commands = true,
    bashMode: enableBashMode = true,
  } = capabilities;

  const callbackRefs = useRef({ onSubmit, onBashCommand, onBashModeChange });
  callbackRefs.current = { onSubmit, onBashCommand, onBashModeChange };

  const prevBashModeRef = useRef(false);
  const submitRef = useRef<() => void>(() => {});
  const draftRef = useRef<ReturnType<typeof useDraftSync> | null>(null);

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
        handleKeyDown: (_view, event) => {
          if (event.key === "Enter" && !event.shiftKey) {
            const suggestionPopup = document.querySelector("[data-tippy-root]");
            if (suggestionPopup) return false;
            event.preventDefault();
            submitRef.current();
            return true;
          }
          return false;
        },
      },
      onUpdate: ({ editor: e }) => {
        const text = e.getText();
        const newBashMode = enableBashMode && text.trimStart().startsWith("!");

        if (newBashMode !== prevBashModeRef.current) {
          prevBashModeRef.current = newBashMode;
          callbackRefs.current.onBashModeChange?.(newBashMode);
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
  }, [editor, isCloud, draft]);

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

  const isEmpty = !editor || editor.isEmpty;
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
