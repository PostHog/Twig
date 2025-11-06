import type { PanelNode } from "@stores/panelStore";
import { usePanelStore } from "@stores/panelStore";
import React from "react";
import { Panel } from "./Panel";
import { PanelGroup } from "./PanelGroup";
import { PanelResizeHandle } from "./PanelResizeHandle";
import { TabbedPanel } from "./TabbedPanel";

interface PanelLayoutProps {
  node: PanelNode;
}

export const PanelLayout: React.FC<PanelLayoutProps> = ({ node }) => {
  const updateSizes = usePanelStore((state) => state.updateSizes);

  if (node.type === "leaf") {
    return <TabbedPanel panelId={node.id} content={node.content} />;
  }

  if (node.type === "group") {
    return (
      <PanelGroup
        direction={node.direction}
        onLayout={(sizes) => updateSizes(node.id, sizes)}
      >
        {node.children.map((child, index) => (
          <React.Fragment key={child.id}>
            <Panel
              defaultSize={node.sizes?.[index] || 100 / node.children.length}
              minSize={15}
            >
              <PanelLayout node={child} />
            </Panel>
            {index < node.children.length - 1 && <PanelResizeHandle />}
          </React.Fragment>
        ))}
      </PanelGroup>
    );
  }

  return null;
};
