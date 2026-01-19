interface DiffStatsBadgeProps {
  added?: number;
  removed?: number;
  files: number;
  /** Render vertically (for collapsed lanes) */
  vertical?: boolean;
}

export function DiffStatsBadge({
  added,
  removed,
  files,
  vertical,
}: DiffStatsBadgeProps) {
  if (files === 0) {
    return null;
  }

  const parts: React.ReactNode[] = [];
  if (added && added > 0) {
    parts.push(
      <span key="added" style={{ color: "var(--green-9)" }}>
        +{added}
      </span>,
    );
  }
  if (removed && removed > 0) {
    parts.push(
      <span key="removed" style={{ color: "var(--red-9)" }}>
        -{removed}
      </span>,
    );
  }
  parts.push(
    <span key="files" className="text-gray-11">
      {files}
    </span>,
  );

  if (vertical) {
    return (
      <span className="flex flex-col items-center gap-0.5 rounded border border-gray-6 bg-gray-2 px-1 py-1 text-[10px]">
        {parts}
      </span>
    );
  }

  return (
    <span
      className="flex shrink-0 items-center rounded border border-gray-6 bg-gray-2 px-1 text-[10px] text-gray-11"
      style={{ gap: "4px" }}
    >
      {parts}
    </span>
  );
}
