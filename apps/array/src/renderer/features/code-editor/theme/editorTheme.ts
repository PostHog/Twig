import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import type { Extension } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { tags as t } from "@lezer/highlight";

function withAlpha(hex: string, alpha: number): string {
  const a = Math.round(alpha * 255)
    .toString(16)
    .padStart(2, "0");
  return `${hex}${a}`;
}

const dark = {
  chalky: "#e5c07b",
  coral: "#e06c75",
  cyan: "#56b6c2",
  invalid: "#ffffff",
  ivory: "#abb2bf",
  stone: "#7d8799",
  malibu: "#61afef",
  sage: "#98c379",
  whiskey: "#d19a66",
  violet: "#c678dd",
  background: "#21252b",
  highlightBackground: "#2c313a",
  tooltipBackground: "#353a42",
  selection: "#3E4451",
  cursor: "#528bff",
};

const light = {
  chalky: "#c18401",
  coral: "#e45649",
  cyan: "#0184bc",
  invalid: "#000000",
  ivory: "#383a42",
  stone: "#a0a1a7",
  malibu: "#4078f2",
  sage: "#50a14f",
  whiskey: "#986801",
  violet: "#a626a4",
  background: "#fafafa",
  highlightBackground: "#d0d0d0",
  tooltipBackground: "#f0f0f0",
  selection: "#d7d7d7",
  cursor: "#526fff",
};

function createEditorTheme(colors: typeof dark, isDark: boolean) {
  return EditorView.theme(
    {
      "&": {
        height: "100%",
        fontSize: "13px",
        color: colors.ivory,
        backgroundColor: "var(--color-background)",
      },
      ".cm-scroller": {
        overflow: "auto",
        fontFamily: "var(--code-font-family)",
      },
      ".cm-content": {
        padding: "16px 0",
        caretColor: colors.cursor,
      },
      ".cm-line": {
        padding: "0 16px",
      },
      ".cm-cursor, .cm-dropCursor": {
        borderLeftColor: colors.cursor,
      },
      "&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection":
        {
          backgroundColor: colors.selection,
        },
      ".cm-panels": {
        backgroundColor: colors.background,
        color: colors.ivory,
      },
      ".cm-panels.cm-panels-top": {
        borderBottom: "2px solid black",
      },
      ".cm-panels.cm-panels-bottom": {
        borderTop: "2px solid black",
      },
      ".cm-searchMatch": {
        backgroundColor: withAlpha(colors.malibu, 0.35),
        outline: `1px solid ${colors.malibu}`,
      },
      ".cm-searchMatch.cm-searchMatch-selected": {
        backgroundColor: withAlpha(colors.malibu, 0.2),
      },
      ".cm-activeLine": {
        backgroundColor: withAlpha(colors.malibu, 0.04),
      },
      ".cm-selectionMatch": {
        backgroundColor: withAlpha(colors.sage, 0.1),
      },
      "&.cm-focused .cm-matchingBracket, &.cm-focused .cm-nonmatchingBracket": {
        backgroundColor: withAlpha(colors.malibu, 0.3),
      },
      ".cm-gutters": {
        backgroundColor: "var(--color-background)",
        color: colors.stone,
        border: "none",
      },
      ".cm-activeLineGutter": {
        backgroundColor: colors.highlightBackground,
      },
      ".cm-foldPlaceholder": {
        backgroundColor: "transparent",
        border: "none",
        color: colors.stone,
      },
      ".cm-tooltip": {
        border: "none",
        backgroundColor: colors.tooltipBackground,
      },
      ".cm-tooltip .cm-tooltip-arrow:before": {
        borderTopColor: "transparent",
        borderBottomColor: "transparent",
      },
      ".cm-tooltip .cm-tooltip-arrow:after": {
        borderTopColor: colors.tooltipBackground,
        borderBottomColor: colors.tooltipBackground,
      },
      ".cm-tooltip-autocomplete": {
        "& > ul > li[aria-selected]": {
          backgroundColor: colors.highlightBackground,
          color: colors.ivory,
        },
      },
    },
    { dark: isDark },
  );
}

function createHighlightStyle(colors: typeof dark) {
  return HighlightStyle.define([
    { tag: t.keyword, color: colors.violet },
    {
      tag: [t.name, t.deleted, t.character, t.propertyName, t.macroName],
      color: colors.coral,
    },
    { tag: [t.function(t.variableName), t.labelName], color: colors.malibu },
    {
      tag: [t.color, t.constant(t.name), t.standard(t.name)],
      color: colors.whiskey,
    },
    { tag: [t.definition(t.name), t.separator], color: colors.ivory },
    {
      tag: [
        t.typeName,
        t.className,
        t.number,
        t.changed,
        t.annotation,
        t.modifier,
        t.self,
        t.namespace,
      ],
      color: colors.chalky,
    },
    {
      tag: [
        t.operator,
        t.operatorKeyword,
        t.url,
        t.escape,
        t.regexp,
        t.link,
        t.special(t.string),
      ],
      color: colors.cyan,
    },
    { tag: [t.meta, t.comment], color: colors.stone },
    { tag: t.strong, fontWeight: "bold" },
    { tag: t.emphasis, fontStyle: "italic" },
    { tag: t.strikethrough, textDecoration: "line-through" },
    { tag: t.link, color: colors.stone, textDecoration: "underline" },
    { tag: t.heading, fontWeight: "bold", color: colors.coral },
    { tag: [t.atom, t.bool, t.special(t.variableName)], color: colors.whiskey },
    {
      tag: [t.processingInstruction, t.string, t.inserted],
      color: colors.sage,
    },
    { tag: t.invalid, color: colors.invalid },
  ]);
}

export const oneDark: Extension = [
  createEditorTheme(dark, true),
  syntaxHighlighting(createHighlightStyle(dark)),
];

export const oneLight: Extension = [
  createEditorTheme(light, false),
  syntaxHighlighting(createHighlightStyle(light)),
];

export const mergeViewTheme = EditorView.baseTheme({
  ".cm-mergeView": {
    overflowY: "auto",
  },
  ".cm-mergeViewEditors": {
    display: "flex",
    alignItems: "stretch",
  },
  ".cm-mergeViewEditor": {
    flexGrow: "1",
    flexBasis: "0",
    overflow: "hidden",
  },
  ".cm-merge-revert": {
    width: "1.6em",
    flexGrow: "0",
    flexShrink: "0",
    position: "relative",
  },
  ".cm-merge-revert button": {
    position: "absolute",
    display: "block",
    width: "100%",
    boxSizing: "border-box",
    textAlign: "center",
    background: "none",
    border: "none",
    font: "inherit",
    cursor: "pointer",
  },
  ".cm-mergeView & .cm-scroller, .cm-mergeView &": {
    height: "auto !important",
    overflowY: "visible !important",
  },
  "&.cm-merge-a .cm-changedLine, .cm-deletedChunk": {
    backgroundColor: "rgba(160, 128, 100, .08)",
  },
  "&.cm-merge-b .cm-changedLine, .cm-inlineChangedLine": {
    backgroundColor: "rgba(100, 160, 128, .08)",
  },
  "&light.cm-merge-a .cm-changedText, &light .cm-deletedChunk .cm-deletedText":
    {
      background:
        "linear-gradient(#ee443366, #ee443366) bottom/100% 2px no-repeat",
    },
  "&dark.cm-merge-a .cm-changedText, &dark .cm-deletedChunk .cm-deletedText": {
    background:
      "linear-gradient(#ffaa9966, #ffaa9966) bottom/100% 2px no-repeat",
  },
  "&light.cm-merge-b .cm-changedText": {
    background:
      "linear-gradient(#22bb22aa, #22bb22aa) bottom/100% 2px no-repeat",
  },
  "&dark.cm-merge-b .cm-changedText": {
    background:
      "linear-gradient(#88ff88aa, #88ff88aa) bottom/100% 2px no-repeat",
  },
  "&.cm-merge-b .cm-deletedText": {
    background: "#ff000033",
  },
  ".cm-insertedLine, .cm-deletedLine, .cm-deletedLine del": {
    textDecoration: "none",
  },
  ".cm-deletedChunk": {
    paddingLeft: "6px",
    "& .cm-chunkButtons": {
      position: "absolute",
      insetInlineEnd: "5px",
    },
    "& button": {
      border: "none",
      cursor: "pointer",
      color: "white",
      margin: "0 2px",
      borderRadius: "3px",
      "&[name=accept]": { background: "#2a2" },
      "&[name=reject]": { background: "#d43" },
    },
  },
  ".cm-collapsedLines": {
    padding: "5px 5px 5px 10px",
    cursor: "pointer",
    "&:before": {
      content: '"⦚"',
      marginInlineEnd: "7px",
    },
    "&:after": {
      content: '"⦚"',
      marginInlineStart: "7px",
    },
  },
  "&light .cm-collapsedLines": {
    color: "#444",
    background:
      "linear-gradient(to bottom, transparent 0, #f3f3f3 30%, #f3f3f3 70%, transparent 100%)",
  },
  "&dark .cm-collapsedLines": {
    color: "#ddd",
    background:
      "linear-gradient(to bottom, transparent 0, #222 30%, #222 70%, transparent 100%)",
  },
  ".cm-changeGutter": { width: "3px", paddingLeft: "1px" },
  "&light.cm-merge-a .cm-changedLineGutter, &light .cm-deletedLineGutter": {
    background: "#e43",
  },
  "&dark.cm-merge-a .cm-changedLineGutter, &dark .cm-deletedLineGutter": {
    background: "#fa9",
  },
  "&light.cm-merge-b .cm-changedLineGutter": { background: "#2b2" },
  "&dark.cm-merge-b .cm-changedLineGutter": { background: "#8f8" },
  ".cm-inlineChangedLineGutter": { background: "#75d" },
});
