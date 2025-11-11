import type { PanelNode, Tab } from "./panelTypes";
import { normalizeSizes, redistributeSizes } from "./panelUtils";

const isLeafNode = (
  node: PanelNode | null,
): node is Extract<PanelNode, { type: "leaf" }> => node?.type === "leaf";

const isGroupNode = (
  node: PanelNode | null,
): node is Extract<PanelNode, { type: "group" }> => node?.type === "group";

export const removeTabFromPanel = (
  node: PanelNode,
  tabId: string,
): PanelNode => {
  if (!isLeafNode(node)) return node;

  const newTabs = node.content.tabs.filter((t) => t.id !== tabId);
  const newActiveTabId =
    node.content.activeTabId === tabId
      ? newTabs[0]?.id || ""
      : node.content.activeTabId;

  return {
    ...node,
    content: { ...node.content, tabs: newTabs, activeTabId: newActiveTabId },
  };
};

export const addTabToPanel = (node: PanelNode, tab: Tab): PanelNode => {
  if (!isLeafNode(node)) return node;

  return {
    ...node,
    content: {
      ...node.content,
      tabs: [...node.content.tabs, tab],
      activeTabId: tab.id,
    },
  };
};

export const setActiveTabInPanel = (
  node: PanelNode,
  tabId: string,
): PanelNode => {
  if (!isLeafNode(node)) return node;

  return {
    ...node,
    content: { ...node.content, activeTabId: tabId },
  };
};

export const findTabInPanel = (
  panel: Extract<PanelNode, { type: "leaf" }>,
  tabId: string,
): Tab | undefined => panel.content.tabs.find((t) => t.id === tabId);

export const updateTreeNode = (
  node: PanelNode,
  targetId: string,
  updateFn: (node: PanelNode) => PanelNode,
): PanelNode => {
  if (node.id === targetId) return updateFn(node);

  if (isGroupNode(node)) {
    return {
      ...node,
      children: node.children.map((child) =>
        updateTreeNode(child, targetId, updateFn),
      ),
    };
  }

  return node;
};

export const cleanupNode = (node: PanelNode): PanelNode | null => {
  if (isLeafNode(node)) {
    return node.content.tabs.length === 0 ? null : node;
  }

  const childrenWithIndices = node.children.map((child, index) => ({
    child: cleanupNode(child),
    originalIndex: index,
  }));

  const cleanedWithIndices = childrenWithIndices.filter(
    (item): item is { child: PanelNode; originalIndex: number } =>
      item.child !== null,
  );

  if (cleanedWithIndices.length === 0) return null;
  if (cleanedWithIndices.length === 1) return cleanedWithIndices[0].child;

  let finalSizes = node.sizes;

  if (cleanedWithIndices.length < node.children.length) {
    if (node.sizes) {
      const removedIndices = new Set(
        node.children
          .map((_, i) => i)
          .filter(
            (i) => !cleanedWithIndices.some((item) => item.originalIndex === i),
          ),
      );

      let newSizes = node.sizes;
      for (const removedIndex of Array.from(removedIndices).sort(
        (a, b) => b - a,
      )) {
        newSizes = redistributeSizes(newSizes, removedIndex);
      }
      finalSizes = newSizes;
    } else {
      finalSizes = normalizeSizes([], cleanedWithIndices.length);
    }
  } else if (!finalSizes || finalSizes.length !== cleanedWithIndices.length) {
    finalSizes = normalizeSizes(finalSizes || [], cleanedWithIndices.length);
  }

  return {
    ...node,
    children: cleanedWithIndices.map((item) => item.child),
    sizes: finalSizes,
  };
};

/**
 * Merges new tree content (components) with existing tree layout (structure, sizes, active tabs).
 * This allows updating component props while preserving user layout modifications.
 * Returns the same reference if no changes were made to prevent unnecessary re-renders.
 */
export const mergeTreeContent = (
  existingTree: PanelNode,
  newTree: PanelNode,
): PanelNode => {
  // If types don't match, prefer the existing layout structure
  if (existingTree.type !== newTree.type) {
    return existingTree;
  }

  if (isLeafNode(existingTree) && isLeafNode(newTree)) {
    // Create a map of new tabs by ID for quick lookup
    const newTabsMap = new Map(newTree.content.tabs.map((tab) => [tab.id, tab]));
    const existingTabIds = new Set(existingTree.content.tabs.map((t) => t.id));

    // Update existing tabs with new components if they exist in new tree
    const updatedTabs = existingTree.content.tabs
      .map((existingTab) => {
        const newTab = newTabsMap.get(existingTab.id);
        if (newTab) {
          // Always update component and callbacks (they contain new task data)
          return {
            ...existingTab,
            component: newTab.component,
            onClose: newTab.onClose,
            onSelect: newTab.onSelect,
            label: newTab.label,
            icon: newTab.icon,
          };
        }
        return existingTab;
      })
      .filter((tab) => newTabsMap.has(tab.id)); // Remove tabs not in new tree

    // Add new tabs that don't exist in existing tree
    const newTabsToAdd = newTree.content.tabs.filter(
      (tab) => !existingTabIds.has(tab.id),
    );

    const finalTabs = [...updatedTabs, ...newTabsToAdd];

    // Preserve the active tab if it still exists, otherwise use first tab
    const activeTabId = finalTabs.some ((t) => t.id === existingTree.content.activeTabId)
      ? existingTree.content.activeTabId
      : finalTabs[0]?.id || "";

    // Always return a new node because React components need to update
    // (components contain new task data even if tab structure is the same)
    return {
      ...existingTree,
      content: {
        ...existingTree.content,
        tabs: finalTabs,
        activeTabId,
      },
    };
  }

  if (isGroupNode(existingTree) && isGroupNode(newTree)) {
    // Recursively merge children
    // Match children by index (assumes same structure)
    const mergedChildren = existingTree.children.map((existingChild, index) => {
      const newChild = newTree.children[index];
      if (newChild) {
        return mergeTreeContent(existingChild, newChild);
      }
      return existingChild;
    });

    // Check if any children actually changed
    const childrenChanged = mergedChildren.some(
      (child, index) => child !== existingTree.children[index],
    );

    if (!childrenChanged) {
      return existingTree;
    }

    return {
      ...existingTree,
      children: mergedChildren,
      // Preserve existing sizes and direction
    };
  }

  return existingTree;
};

export const isLeaf = isLeafNode;
export const isGroup = isGroupNode;
