import type { PanelNode } from "@stores/panelStore";
import React, { useMemo, useState } from "react";
import { Panel } from "./Panel";
import { PanelGroup } from "./PanelGroup";
import { PanelResizeHandle } from "./PanelResizeHandle";
import { compilePanelTree } from "./PanelTree";
import { TabbedPanel } from "./TabbedPanel";

interface PanelLayoutProps {
  tree: React.ReactElement;
}

const PanelLayoutRenderer: React.FC<{ node: PanelNode }> = ({ node }) => {
  const [activeTabs, setActiveTabs] = useState<Record<string, string>>({});

  const handleSetActiveTab = (panelId: string, tabId: string) => {
    setActiveTabs((prev) => ({ ...prev, [panelId]: tabId }));
  };

  const renderNode = (currentNode: PanelNode): React.ReactNode => {
    if (currentNode.type === "leaf") {
      const activeTabId =
        activeTabs[currentNode.id] || currentNode.content.activeTabId;
      const content = {
        ...currentNode.content,
        activeTabId,
      };

      return (
        <TabbedPanel
          panelId={currentNode.id}
          content={content}
          onActiveTabChange={handleSetActiveTab}
        />
      );
    }

    if (currentNode.type === "group") {
      return (
        <PanelGroup direction={currentNode.direction}>
          {currentNode.children.map((child, index) => (
            <React.Fragment key={child.id}>
              <Panel
                defaultSize={
                  currentNode.sizes?.[index] ||
                  100 / currentNode.children.length
                }
                minSize={15}
              >
                {renderNode(child)}
              </Panel>
              {index < currentNode.children.length - 1 && <PanelResizeHandle />}
            </React.Fragment>
          ))}
        </PanelGroup>
      );
    }

    return null;
  };

  return <>{renderNode(node)}</>;
};

export const PanelLayout: React.FC<PanelLayoutProps> = ({ tree }) => {
  const compiledNode = useMemo(() => compilePanelTree(tree), [tree]);

  return <PanelLayoutRenderer node={compiledNode} />;
};
