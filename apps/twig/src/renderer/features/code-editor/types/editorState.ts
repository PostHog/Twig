export type EditorState =
  | { type: "clean" }
  | { type: "dirty" }
  | { type: "conflict"; frozenContent: string; diskMtime: number }
  | { type: "saving" };
