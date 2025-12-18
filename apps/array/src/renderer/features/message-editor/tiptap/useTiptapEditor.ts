import { computePosition, flip, shift } from "@floating-ui/dom";
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
import { useSuggestionStore } from "../stores/suggestionStore";
import {
  getCommandSuggestions,
  getFileSuggestions,
} from "../suggestions/getSuggestions";
import type {
  CommandSuggestionItem,
  FileSuggestionItem,
  SuggestionItem,
  SuggestionType,
} from "../types";
import { type MentionChipAttrs, MentionChipNode } from "./MentionChipNode";

export interface TriggerMatch {
  type: SuggestionType;
  query: string;
  from: number;
  to: number;
}

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

function findTrigger(
  editor: Editor,
  caps: { fileMentions: boolean; commands: boolean },
): TriggerMatch | null {
  const { selection, doc } = editor.state;
  const { from } = selection;

  const textBefore = doc.textBetween(Math.max(0, from - 100), from, "");

  if (caps.fileMentions) {
    const fileMatch = textBefore.match(/(^|\s)@([^\s@]*)$/);
    if (fileMatch) {
      const query = fileMatch[2];
      return {
        type: "file",
        query,
        from: from - query.length - 1,
        to: from,
      };
    }
  }

  if (caps.commands) {
    const cmdMatch = textBefore.match(/(^|\s)\/([^\s]*)$/);
    if (cmdMatch) {
      const query = cmdMatch[2];
      return {
        type: "command",
        query,
        from: from - query.length - 1,
        to: from,
      };
    }
  }

  return null;
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
  const currentTriggerRef = useRef<TriggerMatch | null>(null);
  const prevBashModeRef = useRef(false);
  const submitRef = useRef<() => void>(() => {});

  const draftActions = useDraftStore((s) => s.actions);
  const draft = useDraftStore((s) => s.drafts[sessionId] ?? null);
  const hasHydrated = useDraftStore((s) => s._hasHydrated);

  const suggestionActive = useSuggestionStore((s) => s.active);
  const suggestionActions = useSuggestionStore((s) => s.actions);

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

  const closeSuggestion = useCallback(() => {
    currentTriggerRef.current = null;
    suggestionActions.close();
  }, [suggestionActions]);

  const handleSuggestionSelect = useCallback(
    (index: number, editorInstance: Editor | null) => {
      if (!editorInstance) return;

      const trigger = currentTriggerRef.current;
      const item = useSuggestionStore.getState().items[index];
      if (!trigger || !item) return;

      if (trigger.type === "command") {
        const cmdItem = item as CommandSuggestionItem;
        if (!cmdItem.command.input?.hint) {
          editorInstance.commands.clearContent();
          draftActions.setDraft(sessionId, null);
          closeSuggestion();
          onSubmitRef.current?.(`/${cmdItem.command.name}`);
          return;
        }
      }

      const chip: MentionChipAttrs = {
        type: trigger.type,
        id: item.id,
        label:
          trigger.type === "file"
            ? ((item as FileSuggestionItem).path.split("/").pop() ??
              (item as FileSuggestionItem).path)
            : item.label,
      };

      editorInstance
        .chain()
        .focus()
        .deleteRange({ from: trigger.from, to: trigger.to })
        .insertContent([
          { type: "mentionChip", attrs: chip },
          { type: "text", text: " " },
        ])
        .run();

      closeSuggestion();

      const json = editorInstance.getJSON();
      const content = tiptapJsonToEditorContent(json);
      draftActions.setDraft(
        sessionId,
        isContentEmpty(content) ? null : content,
      );
    },
    [sessionId, draftActions, closeSuggestion],
  );

  const updateSuggestionPosition = useCallback(
    (editorInstance: Editor) => {
      const trigger = currentTriggerRef.current;
      if (!trigger) return;

      const coords = editorInstance.view.coordsAtPos(trigger.from);
      const virtualElement = {
        getBoundingClientRect: () => ({
          x: coords.left,
          y: coords.top,
          width: 0,
          height: coords.bottom - coords.top,
          top: coords.top,
          right: coords.left,
          bottom: coords.bottom,
          left: coords.left,
        }),
      };

      const popup = document.querySelector(
        "[data-suggestion-popup]",
      ) as HTMLElement | null;
      if (!popup) return;

      computePosition(virtualElement, popup, {
        placement: "top-start",
        strategy: "fixed",
        middleware: [shift({ padding: 8 }), flip()],
      }).then(({ x, y }) => {
        suggestionActions.updatePosition({ x, y });
      });
    },
    [suggestionActions],
  );

  const checkForTrigger = useCallback(
    async (editorInstance: Editor) => {
      const trigger = findTrigger(editorInstance, {
        fileMentions: enableFileMentions,
        commands: enableCommands,
      });

      if (!trigger) {
        if (suggestionActive) {
          closeSuggestion();
        }
        return;
      }

      currentTriggerRef.current = trigger;

      if (!suggestionActive) {
        suggestionActions.open(
          sessionId,
          trigger.type,
          { x: 0, y: 0 },
          (index) => handleSuggestionSelect(index, editorInstance),
        );
      }

      try {
        let items: SuggestionItem[];
        if (trigger.type === "file") {
          items = await getFileSuggestions(sessionId, trigger.query);
        } else {
          items = getCommandSuggestions(sessionId, trigger.query);
        }

        suggestionActions.setItems(items);
        suggestionActions.setLoadingState(
          items.length > 0 ? "success" : "idle",
        );
      } catch (error) {
        suggestionActions.setItems([]);
        suggestionActions.setLoadingState("error", String(error));
      }

      requestAnimationFrame(() => updateSuggestionPosition(editorInstance));
    },
    [
      sessionId,
      enableFileMentions,
      enableCommands,
      suggestionActive,
      suggestionActions,
      closeSuggestion,
      handleSuggestionSelect,
      updateSuggestionPosition,
    ],
  );

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: false,
        blockquote: false,
        codeBlock: false,
        bulletList: false,
        orderedList: false,
        listItem: false,
        horizontalRule: false,
      }),
      Placeholder.configure({
        placeholder,
      }),
      MentionChipNode,
    ],
    editable: !disabled,
    autofocus: autoFocus ? "end" : false,
    editorProps: {
      attributes: {
        class:
          "cli-editor min-h-[1.5em] w-full break-words border-none bg-transparent font-mono text-[12px] text-[var(--gray-12)] outline-none [overflow-wrap:break-word] [white-space:pre-wrap] [word-break:break-word]",
      },
      handleKeyDown: (view, event) => {
        if (suggestionActive) {
          if (event.key === "ArrowUp") {
            event.preventDefault();
            suggestionActions.selectPrevious();
            return true;
          }
          if (event.key === "ArrowDown") {
            event.preventDefault();
            suggestionActions.selectNext();
            return true;
          }
          if (event.key === "Enter" || event.key === "Tab") {
            event.preventDefault();
            const state = useSuggestionStore.getState();
            handleSuggestionSelect(
              state.selectedIndex,
              view.state.doc ? (editor as Editor) : null,
            );
            return true;
          }
          if (event.key === "Escape") {
            event.preventDefault();
            closeSuggestion();
            return true;
          }
        }

        if (event.key === "Enter" && !event.shiftKey) {
          event.preventDefault();
          submitRef.current();
          return true;
        }

        return false;
      },
    },
    onUpdate: ({ editor: editorInstance }) => {
      const text = editorInstance.getText();
      const newIsBashMode = enableBashMode && text.trimStart().startsWith("!");

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

      checkForTrigger(editorInstance);
    },
    onSelectionUpdate: ({ editor: editorInstance }) => {
      checkForTrigger(editorInstance);
    },
  });

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
    closeSuggestion();
  }, [editor, sessionId, isCloud, draftActions, closeSuggestion]);

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
