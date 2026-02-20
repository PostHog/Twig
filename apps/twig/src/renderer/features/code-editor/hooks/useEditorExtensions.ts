import {
  highlightSelectionMatches,
  search,
  searchKeymap,
} from "@codemirror/search";
import { EditorState } from "@codemirror/state";
import {
  EditorView,
  highlightActiveLineGutter,
  keymap,
  lineNumbers,
} from "@codemirror/view";
import { useThemeStore } from "@stores/themeStore";
import { useMemo } from "react";
import { useDiffViewerStore } from "../stores/diffViewerStore";
import { mergeViewTheme, oneDark, oneLight } from "../theme/editorTheme";
import { getLanguageExtension } from "../utils/languages";

export function useEditorExtensions(
  filePath?: string,
  readOnly = false,
  isDiff = false,
) {
  const isDarkMode = useThemeStore((state) => state.isDarkMode);
  const wordWrap = useDiffViewerStore((state) => state.wordWrap);

  return useMemo(() => {
    const languageExtension = filePath ? getLanguageExtension(filePath) : null;
    const theme = isDarkMode ? oneDark : oneLight;
    const shouldWrap = isDiff ? wordWrap : true;

    return [
      lineNumbers(),
      highlightActiveLineGutter(),
      search(),
      highlightSelectionMatches(),
      keymap.of(searchKeymap),
      ...(shouldWrap ? [EditorView.lineWrapping] : []),
      theme,
      mergeViewTheme,
      EditorView.editable.of(!readOnly),
      ...(readOnly ? [EditorState.readOnly.of(true)] : []),
      ...(languageExtension ? [languageExtension] : []),
    ];
  }, [filePath, isDarkMode, readOnly, isDiff, wordWrap]);
}
