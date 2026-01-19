import {
  type ChangedFile,
  ChangedFileItem,
} from "@components/ui/ChangedFileItem";
import { useDraggable } from "@dnd-kit/react";

interface DraggableFileItemProps {
  file: ChangedFile;
  repoPath: string;
  layoutId?: string;
  workspace?: string;
}

export function DraggableFileItem({
  file,
  repoPath,
  layoutId,
  workspace,
}: DraggableFileItemProps) {
  const { ref, isDragSource } = useDraggable({
    id: `file-${workspace ?? "unassigned"}-${file.path}`,
    type: "file",
    data: { type: "file", file: file.path, workspace },
  });

  return (
    <div
      ref={ref}
      style={{
        opacity: isDragSource ? 0.5 : 1,
        touchAction: "none",
      }}
    >
      <ChangedFileItem
        file={file}
        repoPath={repoPath}
        layoutId={layoutId}
        workspace={workspace}
        draggable
      />
    </div>
  );
}
