import { Panel } from "@features/panels/components/Panel";
import { PanelGroup } from "@features/panels/components/PanelGroup";
import { PanelResizeHandle } from "@features/panels/components/PanelResizeHandle";
import type { Task } from "@shared/types";
import { BottomPanel } from "./BottomPanel";
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
      <PanelResizeHandle style={{ height: "1px" }} />
      <Panel defaultSize={40} minSize={20}>
        <BottomPanel taskId={taskId} />
      </Panel>
    </PanelGroup>
  );
}
