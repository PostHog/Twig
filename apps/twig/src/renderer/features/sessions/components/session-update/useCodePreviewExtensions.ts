import { EditorState } from "@codemirror/state";
import { EditorView, lineNumbers } from "@codemirror/view";
import {
  mergeViewTheme,
  oneDark,
  oneLight,
} from "@features/code-editor/theme/editorTheme";
import { getLanguageExtension } from "@features/code-editor/utils/languages";
import { useThemeStore } from "@stores/themeStore";
import { useMemo } from "react";

export function useCodePreviewExtensions(
  filePath: string | undefined,
  includeMergeTheme = false,
  firstLineNumber = 1,
) {
  const isDarkMode = useThemeStore((state) => state.isDarkMode);

  return useMemo(() => {
    const languageExtension = filePath ? getLanguageExtension(filePath) : null;
    const theme = isDarkMode ? oneDark : oneLight;
    const compactPadding = EditorView.theme({
      ".cm-content": { padding: "0" },
    });

    return [
      theme,
      ...(includeMergeTheme ? [mergeViewTheme] : []),
      lineNumbers({ formatNumber: (n) => String(n + firstLineNumber - 1) }),
      EditorView.editable.of(false),
      EditorState.readOnly.of(true),
      EditorView.lineWrapping,
      ...(languageExtension ? [languageExtension] : []),
      compactPadding,
    ];
  }, [filePath, isDarkMode, includeMergeTheme, firstLineNumber]);
}

export const CODE_PREVIEW_CONTAINER_STYLE: React.CSSProperties = {
  overflow: "hidden",
  borderTop: "1px solid var(--gray-6)",
  "--color-background": "transparent",
} as React.CSSProperties;

export const CODE_PREVIEW_EDITOR_STYLE = (
  maxHeight: number,
): React.CSSProperties => ({
  maxHeight,
  overflow: "auto",
  fontSize: "12px",
});

export const CODE_PREVIEW_PATH_STYLE: React.CSSProperties = {
  padding: "8px 12px",
  borderBottom: "1px solid var(--gray-a6)",
};
