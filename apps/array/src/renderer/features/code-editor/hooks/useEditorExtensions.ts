import { EditorState } from "@codemirror/state";
import {
  EditorView,
  highlightActiveLineGutter,
  lineNumbers,
} from "@codemirror/view";
import { useThemeStore } from "@stores/themeStore";
import { useMemo } from "react";
import { mergeViewTheme, oneDark, oneLight } from "../theme/editorTheme";
import { getLanguageExtension } from "../utils/languages";

export function useEditorExtensions(filePath?: string, readOnly = false) {
  const isDarkMode = useThemeStore((state) => state.isDarkMode);

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
    ];
  }, [filePath, isDarkMode, readOnly]);
}
