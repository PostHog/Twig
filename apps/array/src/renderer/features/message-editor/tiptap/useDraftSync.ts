import type { Editor, JSONContent } from "@tiptap/core";
import { useCallback, useLayoutEffect, useRef } from "react";
import { useDraftStore } from "../stores/draftStore";
import { type EditorContent, isContentEmpty } from "../utils/content";

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

export interface DraftContext {
  taskId?: string;
  repoPath?: string | null;
}

export function useDraftSync(
  editor: Editor | null,
  sessionId: string,
  context?: DraftContext,
) {
  const hasRestoredRef = useRef(false);
  const editorRef = useRef(editor);
  editorRef.current = editor;

  const draftActions = useDraftStore((s) => s.actions);
  const draft = useDraftStore((s) => s.drafts[sessionId] ?? null);
  const hasHydrated = useDraftStore((s) => s._hasHydrated);

  // Set context for this session
  useLayoutEffect(() => {
    draftActions.setContext(sessionId, {
      taskId: context?.taskId,
      repoPath: context?.repoPath,
    });
    return () => {
      draftActions.removeContext(sessionId);
    };
  }, [sessionId, context?.taskId, context?.repoPath, draftActions]);

  // Restore draft on mount
  useLayoutEffect(() => {
    if (!hasHydrated || !editor || hasRestoredRef.current) return;
    if (!draft || isContentEmpty(draft)) return;

    hasRestoredRef.current = true;

    if (typeof draft === "string") {
      editor.commands.setContent(draft);
    } else {
      editor.commands.setContent(editorContentToTiptapJson(draft));
    }
  }, [hasHydrated, draft, editor]);

  const saveDraft = useCallback(
    (e: Editor) => {
      const json = e.getJSON();
      const content = tiptapJsonToEditorContent(json);
      draftActions.setDraft(
        sessionId,
        isContentEmpty(content) ? null : content,
      );
    },
    [sessionId, draftActions],
  );

  const clearDraft = useCallback(() => {
    draftActions.setDraft(sessionId, null);
  }, [sessionId, draftActions]);

  const getContent = useCallback((): EditorContent => {
    if (!editorRef.current) return { segments: [] };
    return tiptapJsonToEditorContent(editorRef.current.getJSON());
  }, []);

  return { saveDraft, clearDraft, getContent };
}
