import { Panel } from "@features/panels/components/Panel";
import { PanelGroup } from "@features/panels/components/PanelGroup";
import type { Task } from "@shared/types";
import { TopPanel } from "./TopPanel";

interface RightSidebarContentProps {
  taskId: string;
  task: Task;
}

export function RightSidebarContent({
  taskId,
  task,
}: RightSidebarContentProps) {
  return (
    <PanelGroup
      direction="vertical"
      autoSaveId="right-sidebar-panels"
      style={{ backgroundColor: "var(--color-background)" }}
    >
      <Panel defaultSize={60} minSize={20}>
        <TopPanel taskId={taskId} task={task} />
      </Panel>
    </PanelGroup>
  );
}
