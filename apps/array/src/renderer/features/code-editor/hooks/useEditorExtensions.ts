import { EditorState } from "@codemirror/state";
import {
  EditorView,
  highlightActiveLineGutter,
  lineNumbers,
} from "@codemirror/view";
import { commentComposerExtension } from "@features/comments/extensions/commentComposerExtension";
import { commentGutterExtension } from "@features/comments/extensions/commentGutterExtension";
import { commentWidgetExtension } from "@features/comments/extensions/commentWidgetExtension";
import { useCommentStore } from "@features/comments/store/commentStore";
import { useThemeStore } from "@stores/themeStore";
import { useCallback, useMemo } from "react";
import { mergeViewTheme, oneDark, oneLight } from "../theme/editorTheme";
import { getLanguageExtension } from "../utils/languages";

export function useEditorExtensions(
  filePath?: string,
  readOnly = false,
  options?: {
    enableComments?: boolean;
    fileId?: string;
    prNumber?: number;
    directoryPath?: string;
  },
) {
  const isDarkMode = useThemeStore((state) => state.isDarkMode);
  const showComments = useCommentStore((state) => state.showComments);
  const getCommentsForFile = useCommentStore(
    (state) => state.getCommentsForFile,
  );
  const openComposer = useCommentStore((state) => state.openComposer);
  const closeComposer = useCommentStore((state) => state.closeComposer);
  const createComment = useCommentStore((state) => state.createComment);
  const composerState = useCommentStore((state) => state.composerState);

  const {
    enableComments = false,
    fileId,
    prNumber,
    directoryPath,
  } = options || {};

  // Handler for when user clicks "+" to add a comment
  const handleOpenComposer = useCallback(
    (clickedFileId: string, line: number) => {
      openComposer(clickedFileId, line);
    },
    [openComposer],
  );

  // Handler for submitting a new comment
  const handleSubmitComment = useCallback(
    async (line: number, content: string) => {
      if (!fileId || !directoryPath || !prNumber) {
        return;
      }

      try {
        // Get the HEAD commit SHA for the comment
        const commitId =
          await window.electronAPI.getHeadCommitSha(directoryPath);

        await createComment({
          prNumber,
          directoryPath,
          path: fileId,
          line,
          side: "right",
          content,
          commitId,
        });
        closeComposer();
      } catch (_error) {}
    },
    [fileId, createComment, closeComposer, prNumber, directoryPath],
  );

  return useMemo(() => {
    const languageExtension = filePath ? getLanguageExtension(filePath) : null;
    const theme = isDarkMode ? oneDark : oneLight;

    const extensions = [
      lineNumbers(),
      highlightActiveLineGutter(),
      theme,
      mergeViewTheme,
      EditorView.editable.of(!readOnly),
      ...(readOnly ? [EditorState.readOnly.of(true)] : []),
      ...(languageExtension ? [languageExtension] : []),
    ];

    // Add comment extensions if enabled and we have a fileId
    if (enableComments && fileId) {
      // Gutter with "+" button for adding comments
      extensions.push(commentGutterExtension(fileId, handleOpenComposer));
      // Inline comment composer
      extensions.push(
        commentComposerExtension(
          fileId,
          () => composerState,
          handleSubmitComment,
          closeComposer,
        ),
      );
      // Inline comment display
      extensions.push(
        commentWidgetExtension(() => getCommentsForFile(fileId), showComments),
      );
    }

    return extensions;
  }, [
    filePath,
    isDarkMode,
    readOnly,
    enableComments,
    fileId,
    showComments,
    getCommentsForFile,
    handleOpenComposer,
    handleSubmitComment,
    closeComposer,
    composerState,
  ]);
}
