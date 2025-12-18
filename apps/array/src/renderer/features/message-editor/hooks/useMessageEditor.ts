import { useAvailableCommandsForTask } from "@features/sessions/stores/sessionStore";
import { toast } from "@renderer/utils/toast";
import type { JSONContent } from "@tiptap/core";
import { Extension } from "@tiptap/core";
import { Mention } from "@tiptap/extension-mention";
import { Placeholder } from "@tiptap/extension-placeholder";
import { type Editor, useEditor, useEditorState } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { useMessageEditorStore } from "../stores/messageEditorStore";
import { CommandSource } from "../suggestions/sources/commands";
import { FileSource } from "../suggestions/sources/files";
import { createSuggestionOptions } from "../suggestions/suggestionRenderer";

export interface UseMessageEditorOptions {
  sessionId: string;
  taskId?: string;
  placeholder?: string;
  repoPath?: string | null;
  disabled?: boolean;
  isCloud?: boolean;
  onSubmit?: (text: string) => void;
  onBashCommand?: (command: string) => void;
  onBashModeChange?: (isBashMode: boolean) => void;
  autoFocus?: boolean;
}

export interface UseMessageEditorReturn {
  editor: Editor | null;
  isEmpty: boolean;
  isBashMode: boolean;
  submit: () => void;
}

function createSubmitExtension(options: {
  isCloud?: boolean;
  onSubmitRef: React.MutableRefObject<((text: string) => void) | undefined>;
  onBashCommandRef: React.MutableRefObject<
    ((command: string) => void) | undefined
  >;
}): Extension {
  const { isCloud, onSubmitRef, onBashCommandRef } = options;

  return Extension.create({
    name: "submitOnEnter",
    addKeyboardShortcuts() {
      return {
        Enter: () => {
          const text = this.editor.getText().trim();
          if (!text) return false;

          if (text.startsWith("!")) {
            if (isCloud) {
              toast.error("Bash mode is not supported in cloud sessions");
              return true;
            }
            const command = text.slice(1).trim();
            if (command) {
              onBashCommandRef.current?.(command);
            }
          } else {
            onSubmitRef.current?.(text);
          }

          this.editor.commands.clearContent();
          return true;
        },
        Escape: () => {
          this.editor.view.dom.blur();
          return true;
        },
      };
    },
  });
}

function createFileMentionExtension(sessionId: string): Extension {
  return Mention.extend({
    atom: false,
    addAttributes() {
      return {
        id: { default: null },
        label: { default: null },
        type: { default: "file" },
      };
    },
    renderText({ node }: { node: { attrs: { label?: string; id: string } } }) {
      return `@${node.attrs.label || node.attrs.id}`;
    },
  }).configure({
    HTMLAttributes: { class: "cli-file-mention" },
    suggestion: createSuggestionOptions(sessionId, new FileSource(sessionId)),
  }) as Extension;
}

function createSlashCommandExtension(
  sessionId: string,
  onSubmitRef: React.MutableRefObject<((text: string) => void) | undefined>,
): Extension {
  return Mention.extend({
    name: "slashCommand",
    addAttributes() {
      return {
        id: { default: null },
        label: { default: null },
      };
    },
    renderText({ node }: { node: { attrs: { label?: string; id: string } } }) {
      return `/${node.attrs.label || node.attrs.id} `;
    },
  }).configure({
    HTMLAttributes: { class: "cli-slash-command" },
    suggestion: createSuggestionOptions(
      sessionId,
      new CommandSource(sessionId, {
        onSubmit: (text) => onSubmitRef.current?.(text),
      }),
    ),
  }) as Extension;
}

export function useMessageEditor(
  options: UseMessageEditorOptions,
): UseMessageEditorReturn {
  const {
    sessionId,
    taskId,
    repoPath,
    disabled = false,
    placeholder = "Type a message... @ to mention files, / for commands",
    autoFocus = false,
    isCloud = false,
    onSubmit,
    onBashCommand,
    onBashModeChange,
  } = options;

  const actions = useMessageEditorStore((s) => s.actions);
  const draft = useMessageEditorStore((s) => s.drafts[sessionId] ?? null);
  const hasHydrated = useMessageEditorStore((s) => s._hasHydrated);
  const availableCommands = useAvailableCommandsForTask(taskId);

  const onSubmitRef = useRef(onSubmit);
  const onBashCommandRef = useRef(onBashCommand);
  const prevBashModeRef = useRef(false);

  useLayoutEffect(() => {
    onSubmitRef.current = onSubmit;
  }, [onSubmit]);

  useLayoutEffect(() => {
    onBashCommandRef.current = onBashCommand;
  }, [onBashCommand]);

  useLayoutEffect(() => {
    actions.setContext(sessionId, { taskId, repoPath });
  }, [sessionId, taskId, repoPath, actions]);

  useLayoutEffect(() => {
    if (taskId && availableCommands.length > 0) {
      actions.setCommands(taskId, availableCommands);
    }
  }, [taskId, availableCommands, actions]);

  const extensions = useMemo(
    () => [
      StarterKit,
      Placeholder.configure({ placeholder }),
      createSubmitExtension({ isCloud, onSubmitRef, onBashCommandRef }),
      createFileMentionExtension(sessionId),
      createSlashCommandExtension(sessionId, onSubmitRef),
    ],
    [sessionId, placeholder, isCloud],
  );

  const editor = useEditor({
    extensions,
    content: draft ?? "",
    editorProps: {
      attributes: {
        class: "cli-editor outline-none",
        spellcheck: "false",
      },
    },
    autofocus: autoFocus,
    onUpdate: ({ editor: ed }) => {
      actions.setDraft(sessionId, ed.isEmpty ? null : ed.getJSON());
    },
  });

  const { isEmpty, isBashMode } = useEditorState({
    editor,
    selector: ({ editor: ed }) => ({
      isEmpty: ed?.isEmpty ?? true,
      isBashMode: ed?.getText().trimStart().startsWith("!") ?? false,
    }),
  });

  useEffect(() => {
    if (isBashMode !== prevBashModeRef.current) {
      prevBashModeRef.current = isBashMode;
      onBashModeChange?.(isBashMode);
    }
  }, [isBashMode, onBashModeChange]);

  useLayoutEffect(() => {
    if (editor) {
      editor.setEditable(!disabled);
    }
  }, [editor, disabled]);

  useLayoutEffect(() => {
    if (hasHydrated && editor && draft) {
      const currentContent = editor.getJSON();
      const draftStr = JSON.stringify(draft);
      const currentStr = JSON.stringify(currentContent);

      if (draftStr !== currentStr) {
        editor.commands.setContent(draft);
      }
    }
  }, [hasHydrated, editor, draft]);

  useEffect(() => {
    return () => {
      actions.removeContext(sessionId);
    };
  }, [sessionId, actions]);

  const submit = () => {
    if (!editor || editor.isEmpty) return;
    const text = editor.getText().trim();
    if (!text) return;

    if (text.startsWith("!")) {
      if (isCloud) {
        toast.error("Bash mode is not supported in cloud sessions");
        return;
      }
      const command = text.slice(1).trim();
      if (command) {
        onBashCommandRef.current?.(command);
      }
    } else {
      onSubmitRef.current?.(text);
    }

    editor.commands.clearContent();
    actions.setDraft(sessionId, null);
  };

  return {
    editor,
    isEmpty,
    isBashMode,
    submit,
  };
}

export function createEditorHandle(
  editor: Editor | null,
  sessionId: string,
  actions: { setDraft: (sessionId: string, draft: JSONContent | null) => void },
): {
  focus: () => void;
  blur: () => void;
  clear: () => void;
  isEmpty: () => boolean;
  getContent: () => JSONContent | undefined;
  getText: () => string;
} {
  return {
    focus: () => editor?.commands.focus(),
    blur: () => editor?.commands.blur(),
    clear: () => {
      editor?.commands.clearContent();
      actions.setDraft(sessionId, null);
    },
    isEmpty: () => editor?.isEmpty ?? true,
    getContent: () => editor?.getJSON(),
    getText: () => editor?.getText() ?? "",
  };
}
