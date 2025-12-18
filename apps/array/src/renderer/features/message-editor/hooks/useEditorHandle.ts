import { useImperativeHandle } from "react";
import type { EditorContent } from "../core/content";

export interface EditorHandle {
  focus: () => void;
  blur: () => void;
  clear: () => void;
  isEmpty: () => boolean;
  getContent: () => EditorContent;
  getText: () => string;
  setContent: (text: string) => void;
}

interface UseEditorHandleOptions {
  focus: () => void;
  blur: () => void;
  clear: () => void;
  isEmpty: boolean;
  getContent: () => EditorContent;
  getText: () => string;
  setContent: (text: string) => void;
}

export function useEditorHandle(
  ref: React.ForwardedRef<EditorHandle>,
  options: UseEditorHandleOptions,
) {
  const { focus, blur, clear, isEmpty, getContent, getText, setContent } =
    options;

  useImperativeHandle(
    ref,
    () => ({
      focus,
      blur,
      clear,
      isEmpty: () => isEmpty,
      getContent,
      getText,
      setContent,
    }),
    [focus, blur, clear, isEmpty, getContent, getText, setContent],
  );
}
