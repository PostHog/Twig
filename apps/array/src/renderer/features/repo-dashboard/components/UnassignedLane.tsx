import { DiffStatsBadge } from "@components/ui/DiffStatsBadge";
import { useDroppable } from "@dnd-kit/react";
import { BaseLane } from "./BaseLane";
import { DraggableFileItem } from "./DraggableFileItem";

interface DiffStats {
  added: number;
  removed: number;
  files: number;
}

interface UnassignedLaneProps {
  files: string[];
  repoPath: string;
  layoutId?: string;
  stats?: DiffStats;
}

export function UnassignedLane({
  files,
  repoPath,
  layoutId,
  stats,
}: UnassignedLaneProps) {
  const { ref, isDropTarget } = useDroppable({
    id: "workspace-unassigned",
    data: { type: "workspace", workspace: "unassigned" },
    accept: ["file"],
  });

  return (
    <div ref={ref} style={{ height: "100%" }}>
      <BaseLane
        name="Unassigned"
        itemCount={files.length}
        headerActions={
          <DiffStatsBadge
            added={stats?.added}
            removed={stats?.removed}
            files={files.length}
          />
        }
        collapsedStats={
          files.length > 0 ? (
            <DiffStatsBadge
              added={stats?.added}
              removed={stats?.removed}
              files={files.length}
              vertical
            />
          ) : undefined
        }
        containerStyle={{
          width: "240px",
          minWidth: "240px",
          backgroundColor: isDropTarget ? "var(--green-2)" : "var(--gray-2)",
          position: "relative",
          zIndex: 1,
          transition: "background-color 150ms ease",
        }}
        headerStyle={{
          backgroundColor: isDropTarget ? "var(--green-2)" : "var(--gray-1)",
          transition: "background-color 150ms ease",
        }}
        collapsedStyle={{
          backgroundColor: isDropTarget ? "var(--green-2)" : "var(--gray-2)",
          transition: "background-color 150ms ease",
        }}
        emptyMessage="Changes not related to any task will show up here."
      >
        {files.map((file) => (
          <DraggableFileItem
            key={file}
            file={{ path: file, status: "M" }}
            repoPath={repoPath}
            layoutId={layoutId}
            workspace="unassigned"
          />
        ))}
      </BaseLane>
    </div>
  );
}
