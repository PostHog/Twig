import { type Extension, StateField } from "@codemirror/state";
import {
  Decoration,
  type DecorationSet,
  EditorView,
  WidgetType,
} from "@codemirror/view";
import type { Comment } from "@shared/types";
import { createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { CommentThread } from "../components/CommentThread";

/**
 * A CodeMirror widget that renders a React CommentThread component
 */
class CommentWidget extends WidgetType {
  private root: Root | null = null;

  constructor(
    readonly comment: Comment,
    readonly prNumber?: number,
    readonly directoryPath?: string,
  ) {
    super();
  }

  eq(other: CommentWidget) {
    return (
      other.comment.id === this.comment.id &&
      other.comment.content === this.comment.content &&
      other.comment.resolved === this.comment.resolved &&
      other.comment.replies.length === this.comment.replies.length
    );
  }

  toDOM() {
    const container = document.createElement("div");
    container.className = "cm-comment-widget";
    container.style.padding = "8px 16px 8px 48px"; // Left padding to align with code
    container.style.backgroundColor = "var(--gray-1)";
    container.style.borderBottom = "1px solid var(--gray-4)";

    // Use React to render the CommentThread
    this.root = createRoot(container);
    this.root.render(
      createElement(CommentThread, {
        comment: this.comment,
        prNumber: this.prNumber,
        directoryPath: this.directoryPath,
      }),
    );

    return container;
  }

  destroy() {
    // Schedule unmount for next tick to avoid React warnings
    if (this.root) {
      const root = this.root;
      setTimeout(() => root.unmount(), 0);
    }
  }

  ignoreEvent() {
    return true; // Let React handle events
  }
}

/**
 * Creates decorations for all comments in the document
 */
function createCommentDecorations(
  comments: Comment[],
  doc: { lines: number; line: (n: number) => { to: number } },
  prNumber?: number,
  directoryPath?: string,
): DecorationSet {
  const decorations: Array<{ pos: number; widget: CommentWidget }> = [];

  for (const comment of comments) {
    // Get the line in the document (1-indexed in our data, need to find correct line)
    const lineNum = comment.line;
    if (lineNum < 1 || lineNum > doc.lines) continue;

    const line = doc.line(lineNum);
    const widget = new CommentWidget(comment, prNumber, directoryPath);

    decorations.push({
      pos: line.to,
      widget,
    });
  }

  // Sort by position and create decoration set
  decorations.sort((a, b) => a.pos - b.pos);

  return Decoration.set(
    decorations.map(({ pos, widget }) =>
      Decoration.widget({
        widget,
        block: true,
        side: 1, // After the line
      }).range(pos),
    ),
  );
}

/**
 * Comment type for the comments facet
 */
export type CommentsFacetValue = Comment[];

/**
 * Creates a CodeMirror extension that displays comment widgets inline
 * Uses StateField instead of ViewPlugin because block decorations
 * cannot be provided via plugins.
 *
 * @param getComments - Function to get comments for the current file
 * @param showComments - Whether to show comments
 * @param prNumber - Pull request number if available
 * @param directoryPath - Repository directory path
 */
export function commentWidgetExtension(
  getComments: () => Comment[],
  showComments: boolean,
  prNumber?: number,
  directoryPath?: string,
): Extension {
  // If comments are disabled, return an empty extension
  if (!showComments) {
    return [];
  }

  const commentField = StateField.define<DecorationSet>({
    create(state) {
      const comments = getComments();
      return createCommentDecorations(
        comments,
        state.doc,
        prNumber,
        directoryPath,
      );
    },
    update(decorations, tr) {
      if (tr.docChanged) {
        const comments = getComments();
        return createCommentDecorations(
          comments,
          tr.state.doc,
          prNumber,
          directoryPath,
        );
      }
      return decorations;
    },
    provide: (field) => EditorView.decorations.from(field),
  });

  return commentField;
}
