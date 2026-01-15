import { DiffStatsBadge } from "@components/ui/DiffStatsBadge";
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
  return (
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
        backgroundColor: "var(--gray-2)",
        position: "relative",
        zIndex: 1,
      }}
      headerStyle={{
        backgroundColor: "var(--gray-1)",
      }}
      collapsedStyle={{
        backgroundColor: "var(--gray-2)",
      }}
    >
      {files.map((file) => (
        <DraggableFileItem
          key={file}
          file={{ path: file, status: "M" }}
          repoPath={repoPath}
          layoutId={layoutId}
        />
      ))}
    </BaseLane>
  );
}
