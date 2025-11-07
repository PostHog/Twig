import type { PanelNode } from "@stores/panelStore";
import { usePanelStore } from "@stores/panelStore";
import React, { useEffect, useMemo, useRef, useState } from "react";
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
  const updateSizes = usePanelStore((state) => state.updateSizes);

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
        <PanelGroup
          direction={currentNode.direction}
          onLayout={(sizes) => updateSizes(currentNode.id, sizes)}
        >
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
  const setRoot = usePanelStore((state) => state.setRoot);
  const root = usePanelStore((state) => state.root);
  const initializedRef = useRef(false);

  useEffect(() => {
    if (!initializedRef.current) {
      setRoot(compiledNode);
      initializedRef.current = true;
    }
  }, [compiledNode, setRoot]);

  return root ? <PanelLayoutRenderer node={root} /> : null;
};
