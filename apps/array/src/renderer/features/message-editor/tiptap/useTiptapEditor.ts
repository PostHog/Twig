import { toast } from "@renderer/utils/toast";
import type { Editor, JSONContent } from "@tiptap/core";
import Placeholder from "@tiptap/extension-placeholder";
import { useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { useCallback, useEffect, useLayoutEffect, useRef } from "react";
import {
  contentToXml,
  type EditorContent,
  isContentEmpty,
  type MentionChip,
} from "../core/content";
import { useDraftStore } from "../stores/draftStore";
import { createCommandMention } from "./CommandMention";
import { createFileMention } from "./FileMention";
import { MentionChipNode } from "./MentionChipNode";

export interface UseTiptapEditorOptions {
  sessionId: string;
  taskId?: string;
  placeholder?: string;
  repoPath?: string | null;
  disabled?: boolean;
  isCloud?: boolean;
  capabilities?: {
    fileMentions?: boolean;
    commands?: boolean;
    bashMode?: boolean;
  };
  onSubmit?: (text: string) => void;
  onBashCommand?: (command: string) => void;
  onBashModeChange?: (isBashMode: boolean) => void;
  autoFocus?: boolean;
}

export interface UseTiptapEditorReturn {
  editor: Editor | null;
  isEmpty: boolean;
  isBashMode: boolean;
  submit: () => void;
  focus: () => void;
  blur: () => void;
  clear: () => void;
  getText: () => string;
  getContent: () => EditorContent;
  setContent: (text: string) => void;
  insertChip: (chip: MentionChip) => void;
}

function tiptapJsonToEditorContent(json: JSONContent): EditorContent {
  const segments: EditorContent["segments"] = [];

  const traverse = (node: JSONContent) => {
    if (node.type === "text" && node.text) {
      segments.push({ type: "text", text: node.text });
    } else if (node.type === "mentionChip" && node.attrs) {
      segments.push({
        type: "chip",
        chip: {
          type: node.attrs.type,
          id: node.attrs.id,
          label: node.attrs.label,
        },
      });
    } else if (node.content) {
      for (const child of node.content) {
        traverse(child);
      }
    }
  };

  traverse(json);
  return { segments };
}

function editorContentToTiptapJson(content: EditorContent): JSONContent {
  const paragraphContent: JSONContent[] = [];

  for (const seg of content.segments) {
    if (seg.type === "text") {
      paragraphContent.push({ type: "text", text: seg.text });
    } else {
      paragraphContent.push({
        type: "mentionChip",
        attrs: {
          type: seg.chip.type,
          id: seg.chip.id,
          label: seg.chip.label,
        },
      });
    }
  }

  return {
    type: "doc",
    content: [{ type: "paragraph", content: paragraphContent }],
  };
}

export function useTiptapEditor(
  options: UseTiptapEditorOptions,
): UseTiptapEditorReturn {
  const {
    sessionId,
    taskId,
    placeholder = "",
    repoPath,
    disabled = false,
    isCloud = false,
    capabilities = {},
    onSubmit,
    onBashCommand,
    onBashModeChange,
    autoFocus = false,
  } = options;

  const {
    fileMentions: enableFileMentions = true,
    commands: enableCommands = true,
    bashMode: enableBashMode = true,
  } = capabilities;

  const onSubmitRef = useRef(onSubmit);
  const onBashCommandRef = useRef(onBashCommand);
  const onBashModeChangeRef = useRef(onBashModeChange);
  const hasRestoredDraftRef = useRef(false);
  const prevBashModeRef = useRef(false);
  const submitRef = useRef<() => void>(() => {});

  const draftActions = useDraftStore((s) => s.actions);
  const draft = useDraftStore((s) => s.drafts[sessionId] ?? null);
  const hasHydrated = useDraftStore((s) => s._hasHydrated);

  useLayoutEffect(() => {
    onSubmitRef.current = onSubmit;
    onBashCommandRef.current = onBashCommand;
    onBashModeChangeRef.current = onBashModeChange;
  }, [onSubmit, onBashCommand, onBashModeChange]);

  useLayoutEffect(() => {
    draftActions.setContext(sessionId, { taskId, repoPath });
  }, [sessionId, taskId, repoPath, draftActions]);

  useEffect(() => {
    return () => {
      draftActions.removeContext(sessionId);
    };
  }, [sessionId, draftActions]);

  const clearDraft = useCallback(() => {
    draftActions.setDraft(sessionId, null);
  }, [sessionId, draftActions]);

  const handleCommandSubmit = useCallback((text: string) => {
    onSubmitRef.current?.(text);
  }, []);

  const extensions = [
    StarterKit.configure({
      // Disable all block-level formatting
      heading: false,
      blockquote: false,
      codeBlock: false,
      bulletList: false,
      orderedList: false,
      listItem: false,
      horizontalRule: false,
      // Disable all inline formatting (plain text only)
      bold: false,
      italic: false,
      strike: false,
      code: false,
    }),
    Placeholder.configure({ placeholder }),
    MentionChipNode,
  ];

  if (enableFileMentions) {
    extensions.push(createFileMention(sessionId));
  }

  if (enableCommands) {
    extensions.push(
      createCommandMention({
        sessionId,
        onSubmit: handleCommandSubmit,
        onClearDraft: clearDraft,
      }),
    );
  }

  const editor = useEditor(
    {
      extensions,
      editable: !disabled,
      autofocus: autoFocus ? "end" : false,
      editorProps: {
        attributes: {
          class:
            "cli-editor min-h-[1.5em] w-full break-words border-none bg-transparent font-mono text-[12px] text-[var(--gray-12)] outline-none [overflow-wrap:break-word] [white-space:pre-wrap] [word-break:break-word]",
        },
        handleKeyDown: (_view, event) => {
          if (event.key === "Enter" && !event.shiftKey) {
            // Don't handle if suggestion popup is open - let it absorb the keypress
            const suggestionPopup = document.querySelector("[data-tippy-root]");
            if (suggestionPopup) {
              return false;
            }
            event.preventDefault();
            submitRef.current();
            return true;
          }
          return false;
        },
      },
      onUpdate: ({ editor: editorInstance }) => {
        const text = editorInstance.getText();
        const newIsBashMode =
          enableBashMode && text.trimStart().startsWith("!");

        if (newIsBashMode !== prevBashModeRef.current) {
          prevBashModeRef.current = newIsBashMode;
          onBashModeChangeRef.current?.(newIsBashMode);
        }

        const json = editorInstance.getJSON();
        const content = tiptapJsonToEditorContent(json);
        draftActions.setDraft(
          sessionId,
          isContentEmpty(content) ? null : content,
        );
      },
    },
    [sessionId, disabled, enableFileMentions, enableCommands, placeholder],
  );

  useLayoutEffect(() => {
    if (
      hasHydrated &&
      editor &&
      !hasRestoredDraftRef.current &&
      draft &&
      !isContentEmpty(draft)
    ) {
      hasRestoredDraftRef.current = true;

      if (typeof draft === "string") {
        editor.commands.setContent(draft);
      } else {
        const json = editorContentToTiptapJson(draft);
        editor.commands.setContent(json);
      }

      const text = editor.getText();
      if (enableBashMode && text.trimStart().startsWith("!")) {
        prevBashModeRef.current = true;
        onBashModeChangeRef.current?.(true);
      }
    }
  }, [hasHydrated, draft, editor, enableBashMode]);

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
      if (command) {
        onBashCommandRef.current?.(command);
      }
    } else {
      const json = editor.getJSON();
      const content = tiptapJsonToEditorContent(json);
      const xmlText = contentToXml(content);
      onSubmitRef.current?.(xmlText);
    }

    editor.commands.clearContent();
    prevBashModeRef.current = false;
    draftActions.setDraft(sessionId, null);
  }, [editor, sessionId, isCloud, draftActions]);

  useLayoutEffect(() => {
    submitRef.current = submit;
  }, [submit]);

  const focus = useCallback(() => {
    editor?.commands.focus("end");
  }, [editor]);

  const blur = useCallback(() => {
    editor?.commands.blur();
  }, [editor]);

  const clear = useCallback(() => {
    editor?.commands.clearContent();
    prevBashModeRef.current = false;
    draftActions.setDraft(sessionId, null);
  }, [editor, sessionId, draftActions]);

  const getText = useCallback(() => {
    return editor?.getText() ?? "";
  }, [editor]);

  const getContent = useCallback((): EditorContent => {
    if (!editor) return { segments: [] };
    return tiptapJsonToEditorContent(editor.getJSON());
  }, [editor]);

  const setContent = useCallback(
    (text: string) => {
      if (!editor) return;
      editor.commands.setContent(text);
      editor.commands.focus("end");

      const json = editor.getJSON();
      const content = tiptapJsonToEditorContent(json);
      draftActions.setDraft(
        sessionId,
        isContentEmpty(content) ? null : content,
      );
    },
    [editor, sessionId, draftActions],
  );

  const insertChip = useCallback(
    (chip: MentionChip) => {
      if (!editor) return;
      editor.commands.insertMentionChip({
        type: chip.type,
        id: chip.id,
        label: chip.label,
      });

      const json = editor.getJSON();
      const content = tiptapJsonToEditorContent(json);
      draftActions.setDraft(
        sessionId,
        isContentEmpty(content) ? null : content,
      );
    },
    [editor, sessionId, draftActions],
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
    getContent,
    setContent,
    insertChip,
  };
}
