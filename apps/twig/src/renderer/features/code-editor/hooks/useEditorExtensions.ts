import { EditorState } from "@codemirror/state";
import {
  EditorView,
  highlightActiveLineGutter,
  lineNumbers,
} from "@codemirror/view";
import { useThemeStore } from "@stores/themeStore";
import { useEffect, useMemo, useRef } from "react";
import { dirtyTracking } from "../extensions/dirtyTracking";
import { mergeViewTheme, oneDark, oneLight } from "../theme/editorTheme";
import { getLanguageExtension } from "../utils/languages";

export function useEditorExtensions(
  filePath?: string,
  readOnly = false,
  onDirtyChange?: (isDirty: boolean) => void,
) {
  const isDarkMode = useThemeStore((state) => state.isDarkMode);
  const onDirtyChangeRef = useRef(onDirtyChange);

  useEffect(() => {
    onDirtyChangeRef.current = onDirtyChange;
  }, [onDirtyChange]);

  return useMemo(() => {
    const languageExtension = filePath ? getLanguageExtension(filePath) : null;
    const theme = isDarkMode ? oneDark : oneLight;

    return [
      lineNumbers(),
      highlightActiveLineGutter(),
      theme,
      mergeViewTheme,
      EditorView.editable.of(!readOnly),
      ...(readOnly ? [EditorState.readOnly.of(true)] : []),
      ...(languageExtension ? [languageExtension] : []),
      dirtyTracking((isDirty) => onDirtyChangeRef.current?.(isDirty)),
    ];
  }, [filePath, isDarkMode, readOnly]);
}
