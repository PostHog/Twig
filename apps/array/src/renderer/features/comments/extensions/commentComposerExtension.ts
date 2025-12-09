import { type Extension, StateField } from "@codemirror/state";
import {
  Decoration,
  type DecorationSet,
  EditorView,
  WidgetType,
} from "@codemirror/view";
import { createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { CommentComposer } from "../components/CommentComposer";

interface ComposerState {
  fileId: string;
  line: number;
}

/**
 * A CodeMirror widget that renders the CommentComposer component
 */
class ComposerWidget extends WidgetType {
  private root: Root | null = null;

  constructor(
    private readonly line: number,
    private readonly onSubmit: (content: string) => void,
    private readonly onCancel: () => void,
  ) {
    super();
  }

  eq(other: ComposerWidget) {
    return other.line === this.line;
  }

  toDOM() {
    const container = document.createElement("div");
    container.className = "cm-comment-composer-widget";
    container.style.padding = "8px 16px 8px 48px";
    container.style.backgroundColor = "var(--accent-2)";
    container.style.borderBottom = "1px solid var(--accent-6)";
    container.style.borderTop = "1px solid var(--accent-6)";

    this.root = createRoot(container);
    this.root.render(
      createElement(CommentComposer, {
        onSubmit: this.onSubmit,
        onCancel: this.onCancel,
        autoFocus: true,
      }),
    );

    return container;
  }

  destroy() {
    if (this.root) {
      const root = this.root;
      setTimeout(() => root.unmount(), 0);
    }
  }

  ignoreEvent() {
    return true;
  }
}

/**
 * Creates decorations for the composer widget
 */
function createComposerDecorations(
  composerState: ComposerState | null,
  fileId: string,
  doc: { lines: number; line: (n: number) => { to: number } },
  onSubmit: (content: string) => void,
  onCancel: () => void,
): DecorationSet {
  // Only show composer if it's for this file
  if (!composerState || composerState.fileId !== fileId) {
    return Decoration.none;
  }

  const lineNum = composerState.line;
  if (lineNum < 1 || lineNum > doc.lines) {
    return Decoration.none;
  }

  const line = doc.line(lineNum);
  const widget = new ComposerWidget(lineNum, onSubmit, onCancel);

  return Decoration.set([
    Decoration.widget({
      widget,
      block: true,
      side: 1,
    }).range(line.to),
  ]);
}

/**
 * Creates a CodeMirror extension that displays the comment composer inline
 */
export function commentComposerExtension(
  fileId: string,
  getComposerState: () => ComposerState | null,
  onSubmit: (line: number, content: string) => void,
  onCancel: () => void,
): Extension {
  const composerField = StateField.define<DecorationSet>({
    create(state) {
      const composerState = getComposerState();
      return createComposerDecorations(
        composerState,
        fileId,
        state.doc,
        (content) => {
          const cs = getComposerState();
          if (cs) onSubmit(cs.line, content);
        },
        onCancel,
      );
    },
    update(_decorations, tr) {
      // Always rebuild - composer state might have changed
      const composerState = getComposerState();
      return createComposerDecorations(
        composerState,
        fileId,
        tr.state.doc,
        (content) => {
          const cs = getComposerState();
          if (cs) onSubmit(cs.line, content);
        },
        onCancel,
      );
    },
    provide: (field) => EditorView.decorations.from(field),
  });

  return composerField;
}
