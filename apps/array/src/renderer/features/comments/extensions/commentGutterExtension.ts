import type { Extension } from "@codemirror/state";
import { EditorView, GutterMarker, gutter } from "@codemirror/view";

/**
 * Spacer marker to reserve space in the gutter
 */
class SpacerMarker extends GutterMarker {
  toDOM() {
    const spacer = document.createElement("span");
    spacer.className = "cm-comment-add-button cm-comment-add-spacer";
    spacer.textContent = "+";
    return spacer;
  }
}

/**
 * Gutter marker that shows a "+" button for adding comments
 */
class AddCommentMarker extends GutterMarker {
  constructor(
    private readonly fileId: string,
    private readonly line: number,
    private readonly onAddComment: (fileId: string, line: number) => void,
  ) {
    super();
  }

  toDOM() {
    const button = document.createElement("button");
    button.className = "cm-comment-add-button";
    button.textContent = "+";
    button.title = "Add comment";
    button.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.onAddComment(this.fileId, this.line);
    });
    return button;
  }
}

/**
 * Creates the comment gutter extension that shows "+" buttons on hover
 */
export function commentGutterExtension(
  fileId: string,
  onAddComment: (fileId: string, line: number) => void,
): Extension {
  // Create a gutter that shows "+" on every line
  const commentGutter = gutter({
    class: "cm-comment-gutter",
    lineMarker: (view, line) => {
      const lineNumber = view.state.doc.lineAt(line.from).number;
      return new AddCommentMarker(fileId, lineNumber, onAddComment);
    },
    initialSpacer: () => new SpacerMarker(),
  });

  // Styles for the comment gutter
  const commentGutterStyles = EditorView.baseTheme({
    ".cm-comment-gutter": {
      width: "20px",
      cursor: "pointer",
    },
    ".cm-comment-add-button": {
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      width: "16px",
      height: "16px",
      margin: "0 2px",
      padding: "0",
      border: "none",
      borderRadius: "3px",
      background: "transparent",
      color: "var(--accent-9)",
      fontSize: "14px",
      fontWeight: "bold",
      lineHeight: "1",
      cursor: "pointer",
      opacity: "0",
      transition: "opacity 0.15s ease, background-color 0.15s ease",
    },
    ".cm-comment-add-spacer": {
      visibility: "hidden",
    },
    // Show button on line hover
    ".cm-line:hover + .cm-comment-gutter .cm-comment-add-button, .cm-gutters:hover .cm-comment-add-button":
      {
        opacity: "0",
      },
    // Show on gutter hover for that specific line
    ".cm-gutter.cm-comment-gutter .cm-gutterElement:hover .cm-comment-add-button":
      {
        opacity: "1",
        background: "var(--accent-3)",
      },
    ".cm-comment-add-button:hover": {
      opacity: "1 !important",
      background: "var(--accent-4) !important",
    },
    ".cm-comment-add-button:active": {
      background: "var(--accent-5) !important",
    },
  });

  return [commentGutter, commentGutterStyles];
}
