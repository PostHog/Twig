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

export function serializeContent(element: HTMLDivElement): EditorContent {
  const segments: EditorContent["segments"] = [];

  for (const node of element.childNodes) {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent ?? "";
      if (text) {
        segments.push({ type: "text", text });
      }
    } else if (node.nodeType === Node.ELEMENT_NODE) {
      const el = node as HTMLElement;
      if (el.classList.contains("mention-chip")) {
        const chipType = el.dataset.chipType as MentionChip["type"];
        const chipId = el.dataset.chipId ?? "";
        const chipLabel = el.dataset.chipLabel ?? el.textContent ?? "";
        segments.push({
          type: "chip",
          chip: { type: chipType, id: chipId, label: chipLabel },
        });
      } else {
        const text = el.textContent ?? "";
        if (text) {
          segments.push({ type: "text", text });
        }
      }
    }
  }

  return { segments };
}

export function renderChipToElement(chip: MentionChip): HTMLSpanElement {
  const isCommand = chip.type === "command";
  const typeClass = isCommand ? "cli-slash-command" : "cli-file-mention";

  const el = document.createElement("span");
  el.className = `mention-chip ${typeClass} inline-block rounded-[var(--radius-1)] bg-[var(--accent-a3)] px-1 py-px font-medium text-[var(--accent-11)]`;
  el.contentEditable = "false";
  el.dataset.chipType = chip.type;
  el.dataset.chipId = chip.id;
  el.dataset.chipLabel = chip.label;
  el.style.userSelect = "all";
  el.style.cursor = "default";
  el.style.fontSize = "12px";
  el.textContent = isCommand ? `/${chip.label}` : `@${chip.label}`;

  return el;
}

export function renderContentToElement(
  element: HTMLDivElement,
  content: EditorContent,
): void {
  element.innerHTML = "";

  for (const segment of content.segments) {
    if (segment.type === "text") {
      element.appendChild(document.createTextNode(segment.text));
    } else {
      element.appendChild(renderChipToElement(segment.chip));
    }
  }
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
