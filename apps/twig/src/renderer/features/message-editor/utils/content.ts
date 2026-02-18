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

export interface FileAttachment {
  id: string;
  label: string;
}

export interface EditorContent {
  segments: Array<
    { type: "text"; text: string } | { type: "chip"; chip: MentionChip }
  >;
  attachments?: FileAttachment[];
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

function escapeXmlAttr(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export function contentToXml(content: EditorContent): string {
  const inlineFilePaths = new Set<string>();
  const parts = content.segments.map((seg) => {
    if (seg.type === "text") return seg.text;
    const chip = seg.chip;
    const escapedId = escapeXmlAttr(chip.id);
    switch (chip.type) {
      case "file":
        inlineFilePaths.add(chip.id);
        return `<file path="${escapedId}" />`;
      case "command":
        return `/${chip.label}`;
      case "error":
        return `<error id="${escapedId}" />`;
      case "experiment":
        return `<experiment id="${escapedId}" />`;
      case "insight":
        return `<insight id="${escapedId}" />`;
      case "feature_flag":
        return `<feature_flag id="${escapedId}" />`;
      default:
        return `@${chip.label}`;
    }
  });

  // Append file tags for attachments not already referenced inline
  if (content.attachments) {
    for (const att of content.attachments) {
      if (!inlineFilePaths.has(att.id)) {
        parts.push(`<file path="${escapeXmlAttr(att.id)}" />`);
      }
    }
  }

  return parts.join("");
}

export function isContentEmpty(
  content: EditorContent | null | string,
): boolean {
  if (!content) return true;
  if (typeof content === "string") return !content.trim();
  if (content.attachments && content.attachments.length > 0) return false;
  if (!content.segments) return true;
  return content.segments.every(
    (seg) => seg.type === "text" && !seg.text.trim(),
  );
}

export function extractFilePaths(content: EditorContent): string[] {
  const filePaths: string[] = [];
  const seen = new Set<string>();

  for (const seg of content.segments) {
    if (
      seg.type === "chip" &&
      seg.chip.type === "file" &&
      !seen.has(seg.chip.id)
    ) {
      seen.add(seg.chip.id);
      filePaths.push(seg.chip.id);
    }
  }

  if (content.attachments) {
    for (const att of content.attachments) {
      if (!seen.has(att.id)) {
        seen.add(att.id);
        filePaths.push(att.id);
      }
    }
  }

  return filePaths;
}
