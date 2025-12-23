export interface MentionChip {
  type:
    | "file"
    | "command"
    | "error"
    | "experiment"
    | "insight"
    | "feature_flag";
  id: string;
  label: string;
}

export interface EditorContent {
  segments: Array<
    { type: "text"; text: string } | { type: "chip"; chip: MentionChip }
  >;
}

export function contentToPlainText(content: EditorContent): string {
  return content.segments
    .map((seg) => {
      if (seg.type === "text") return seg.text;
      const chip = seg.chip;
      if (chip.type === "file") return `@${chip.label}`;
      if (chip.type === "command") return `/${chip.label}`;
      return `@${chip.label}`;
    })
    .join("");
}

export function contentToXml(content: EditorContent): string {
  return content.segments
    .map((seg) => {
      if (seg.type === "text") return seg.text;
      const chip = seg.chip;
      switch (chip.type) {
        case "file":
          return `<file path="${chip.id}" />`;
        case "command":
          return `/${chip.label}`;
        case "error":
          return `<error id="${chip.id}" />`;
        case "experiment":
          return `<experiment id="${chip.id}" />`;
        case "insight":
          return `<insight id="${chip.id}" />`;
        case "feature_flag":
          return `<feature_flag id="${chip.id}" />`;
        default:
          return `@${chip.label}`;
      }
    })
    .join("");
}

export function isContentEmpty(
  content: EditorContent | null | string,
): boolean {
  if (!content) return true;
  if (typeof content === "string") return !content.trim();
  if (!content.segments) return true;
  return content.segments.every(
    (seg) => seg.type === "text" && !seg.text.trim(),
  );
}
