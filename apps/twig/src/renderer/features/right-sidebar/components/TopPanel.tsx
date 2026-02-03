import { TabbedPanel } from "@features/panels/components/TabbedPanel";
import type { PanelContent } from "@features/panels/store/panelTypes";
import { ChangesPanel } from "@features/task-detail/components/ChangesPanel";
import { FileTreePanel } from "@features/task-detail/components/FileTreePanel";
import { FolderSimple, GitDiff } from "@phosphor-icons/react";
import type { Task } from "@shared/types";
import { useMemo, useState } from "react";

interface TopPanelProps {
  taskId: string;
  task: Task;
}

export function TopPanel({ taskId, task }: TopPanelProps) {
  const [activeTabId, setActiveTabId] = useState("changes");

  const content: PanelContent = useMemo(
    () => ({
      id: `top-panel-${taskId}`,
      activeTabId,
      tabs: [
        {
          id: "changes",
          label: "Changes",
          icon: <GitDiff size={14} />,
          data: { type: "other" },
          draggable: false,
          closeable: false,
          component: <ChangesPanel taskId={taskId} task={task} />,
        },
        {
          id: "files",
          label: "Files",
          icon: <FolderSimple size={14} />,
          data: { type: "other" },
          draggable: false,
          closeable: false,
          component: <FileTreePanel taskId={taskId} task={task} />,
        },
      ],
    }),
    [taskId, task, activeTabId],
  );

  return (
    <TabbedPanel
      panelId={`top-panel-${taskId}`}
      content={content}
      onActiveTabChange={(_, tabId) => setActiveTabId(tabId)}
    />
  );
}
