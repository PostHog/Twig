import React, { useEffect, useMemo, useRef, useState } from "react";
import type { ImperativePanelGroupHandle } from "react-resizable-panels";
import type { PanelNode } from "../store/panelStore";
import { usePanelStore } from "../store/panelStore";
import { mergeTreeContent } from "../store/panelTree";
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
  const groupRefs = useRef<Map<string, ImperativePanelGroupHandle>>(new Map());

  useEffect(() => {
    const syncActiveTabsFromTree = (currentNode: PanelNode) => {
      if (currentNode.type === "leaf" && currentNode.content.activeTabId) {
        setActiveTabs((prev) => {
          if (prev[currentNode.id] !== currentNode.content.activeTabId) {
            return {
              ...prev,
              [currentNode.id]: currentNode.content.activeTabId,
            };
          }
          return prev;
        });
      } else if (currentNode.type === "group") {
        currentNode.children.forEach(syncActiveTabsFromTree);
      }
    };

    syncActiveTabsFromTree(node);
  }, [node]);

  const handleSetActiveTab = (panelId: string, tabId: string) => {
    setActiveTabs((prev) => ({ ...prev, [panelId]: tabId }));
  };

  const setGroupRef = (
    groupId: string,
    ref: ImperativePanelGroupHandle | null,
  ) => {
    if (ref) {
      groupRefs.current.set(groupId, ref);
    } else {
      groupRefs.current.delete(groupId);
    }
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
          ref={(ref) => setGroupRef(currentNode.id, ref)}
          direction={currentNode.direction}
          onLayout={(sizes) => {
            // Only update store, don't normalize here
            // The library is the source of truth for sizes during user interaction
            updateSizes(currentNode.id, sizes);
          }}
        >
          {currentNode.children.map((child, index) => (
            <React.Fragment key={child.id}>
              <Panel
                id={child.id}
                order={index}
                defaultSize={
                  currentNode.sizes?.[index] ??
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

  useEffect(() => {
    const syncSizesToLibrary = (currentNode: PanelNode) => {
      if (currentNode.type === "group" && currentNode.sizes) {
        const groupRef = groupRefs.current.get(currentNode.id);
        if (groupRef) {
          // Get current layout from library
          const currentLayout = groupRef.getLayout();

          // Only update if sizes are significantly different (avoid feedback loops)
          const isDifferent = currentLayout.some(
            (size, i) => Math.abs(size - (currentNode.sizes?.[i] ?? 0)) > 0.1,
          );

          if (
            isDifferent &&
            currentNode.sizes.length === currentLayout.length
          ) {
            groupRef.setLayout(currentNode.sizes);
          }
        }

        // Recursively sync child groups
        currentNode.children.forEach(syncSizesToLibrary);
      }
    };

    syncSizesToLibrary(node);
  }, [node]);

  return <>{renderNode(node)}</>;
};

export const PanelLayout: React.FC<PanelLayoutProps> = ({ tree }) => {
  const compiledNode = useMemo(() => compilePanelTree(tree), [tree]);
  const root = usePanelStore((state) => state.root);
  const compiledRef = useRef(compiledNode);
  const isUpdatingRef = useRef(false);

  // Track if compiled node changed
  const nodeChanged = compiledRef.current !== compiledNode;
  if (nodeChanged) {
    compiledRef.current = compiledNode;
  }

  // Initialize or update store synchronously during render
  if (nodeChanged && !isUpdatingRef.current) {
    isUpdatingRef.current = true;

    const currentRoot = usePanelStore.getState().root;
    if (currentRoot === null) {
      // First time - initialize
      usePanelStore.getState().setRoot(compiledNode);
    } else {
      // Update components while preserving layout
      const merged = mergeTreeContent(currentRoot, compiledNode);
      usePanelStore.getState().setRoot(merged);
    }

    // Reset flag after render completes
    Promise.resolve().then(() => {
      isUpdatingRef.current = false;
    });
  }

  return root ? <PanelLayoutRenderer node={root} /> : null;
};
