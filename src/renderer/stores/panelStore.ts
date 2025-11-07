import { create } from "zustand";

export type Tab = {
  id: string;
  label: string;
  component?: React.ReactNode;
  closeable?: boolean;
  onClose?: () => void;
  onSelect?: () => void;
  icon?: React.ReactNode;
};

export type PanelContent = {
  id: string;
  tabs: Tab[];
  activeTabId: string;
  showTabs?: boolean;
  droppable?: boolean;
};

export type PanelNode =
  | {
      type: "leaf";
      id: string;
      content: PanelContent;
      size?: number;
    }
  | {
      type: "group";
      id: string;
      direction: "horizontal" | "vertical";
      children: PanelNode[];
      sizes?: number[];
    };

export type SplitDirection = "top" | "bottom" | "left" | "right";

const isLeafNode = (
  node: PanelNode | null,
): node is Extract<PanelNode, { type: "leaf" }> => {
  return node?.type === "leaf";
};

const isGroupNode = (
  node: PanelNode | null,
): node is Extract<PanelNode, { type: "group" }> => {
  return node?.type === "group";
};

interface PanelStore {
  root: PanelNode | null;
  draggingTabId: string | null;
  draggingTabPanelId: string | null;
  idCounter: number;

  setRoot: (root: PanelNode) => void;
  setDraggingTab: (tabId: string | null, panelId: string | null) => void;
  findPanel: (id: string, node?: PanelNode) => PanelNode | null;
  moveTab: (
    tabId: string,
    sourcePanelId: string,
    targetPanelId: string,
  ) => void;
  splitPanel: (
    tabId: string,
    sourcePanelId: string,
    targetPanelId: string,
    direction: SplitDirection,
  ) => void;
  setActiveTab: (panelId: string, tabId: string) => void;
  closeTab: (panelId: string, tabId: string) => void;
  cleanupTree: () => void;
  updateSizes: (groupId: string, sizes: number[]) => void;
  reorderTabs: (
    panelId: string,
    sourceIndex: number,
    targetIndex: number,
  ) => void;
}

const removeTabFromPanel = (node: PanelNode, tabId: string): PanelNode => {
  if (!isLeafNode(node)) return node;

  const newTabs = node.content.tabs.filter((t) => t.id !== tabId);
  const newActiveTabId =
    node.content.activeTabId === tabId
      ? newTabs[0]?.id || ""
      : node.content.activeTabId;

  return {
    ...node,
    content: {
      ...node.content,
      tabs: newTabs,
      activeTabId: newActiveTabId,
    },
  };
};

const addTabToPanel = (node: PanelNode, tab: Tab): PanelNode => {
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

const setActiveTabInPanel = (node: PanelNode, tabId: string): PanelNode => {
  if (!isLeafNode(node)) return node;

  return {
    ...node,
    content: {
      ...node.content,
      activeTabId: tabId,
    },
  };
};

const findTabInPanel = (
  panel: Extract<PanelNode, { type: "leaf" }>,
  tabId: string,
): Tab | undefined => {
  return panel.content.tabs.find((t) => t.id === tabId);
};

const updateTreeNode = (
  node: PanelNode,
  targetId: string,
  updateFn: (node: PanelNode) => PanelNode,
): PanelNode => {
  if (node.id === targetId) {
    return updateFn(node);
  }

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

const cleanupNode = (node: PanelNode): PanelNode | null => {
  if (isLeafNode(node)) {
    return node.content.tabs.length === 0 ? null : node;
  }

  const cleanedChildren = node.children
    .map(cleanupNode)
    .filter((child): child is PanelNode => child !== null);

  if (cleanedChildren.length === 0) return null;
  if (cleanedChildren.length === 1) return cleanedChildren[0];

  return {
    ...node,
    children: cleanedChildren,
  };
};

export const usePanelStore = create<PanelStore>((set, get) => {
  const generateId = (prefix: string): string => {
    const id = `${prefix}-${get().idCounter}`;
    set((state) => ({ idCounter: state.idCounter + 1 }));
    return id;
  };

  const setRootWithCleanup = (root: PanelNode | null) => {
    set({ root: root ? cleanupNode(root) : null });
  };

  const getLeafPanel = (
    panelId: string,
  ): Extract<PanelNode, { type: "leaf" }> | null => {
    const panel = get().findPanel(panelId);
    return isLeafNode(panel) ? panel : null;
  };

  return {
    root: null,
    draggingTabId: null,
    draggingTabPanelId: null,
    idCounter: 0,

    setRoot: (root) => set({ root }),

    setDraggingTab: (tabId, panelId) =>
      set({ draggingTabId: tabId, draggingTabPanelId: panelId }),

    findPanel: (id, node) => {
      const searchNode = node ?? get().root;
      if (!searchNode) return null;
      if (searchNode.id === id) return searchNode;

      if (isGroupNode(searchNode)) {
        for (const child of searchNode.children) {
          const found = get().findPanel(id, child);
          if (found) return found;
        }
      }

      return null;
    },

    moveTab: (tabId, sourcePanelId, targetPanelId) => {
      const { root } = get();
      if (!root || sourcePanelId === targetPanelId) return;

      const sourcePanel = getLeafPanel(sourcePanelId);
      const targetPanel = getLeafPanel(targetPanelId);
      if (!sourcePanel || !targetPanel) return;

      const tabToMove = findTabInPanel(sourcePanel, tabId);
      if (!tabToMove) return;

      const updatedRoot = updateTreeNode(
        updateTreeNode(root, sourcePanelId, (node) =>
          removeTabFromPanel(node, tabId),
        ),
        targetPanelId,
        (node) => addTabToPanel(node, tabToMove),
      );

      setRootWithCleanup(updatedRoot);
    },

    setActiveTab: (panelId, tabId) => {
      const { root } = get();
      if (!root) return;

      set({
        root: updateTreeNode(root, panelId, (node) =>
          setActiveTabInPanel(node, tabId),
        ),
      });
    },

    splitPanel: (tabId, sourcePanelId, targetPanelId, direction) => {
      const { root } = get();
      if (!root) return;

      const sourcePanel = getLeafPanel(sourcePanelId);
      if (!sourcePanel) return;

      const tabToMove = findTabInPanel(sourcePanel, tabId);
      if (!tabToMove) return;

      const newPanelId = generateId("panel");
      const isVerticalSplit = direction === "top" || direction === "bottom";
      const groupDirection = isVerticalSplit ? "vertical" : "horizontal";

      const newPanel: PanelNode = {
        type: "leaf",
        id: newPanelId,
        content: {
          id: newPanelId,
          tabs: [tabToMove],
          activeTabId: tabToMove.id,
          showTabs: true,
        },
      };

      const newPanelFirst = direction === "top" || direction === "left";

      const updateInNode = (node: PanelNode): PanelNode => {
        if (node.id === targetPanelId && isLeafNode(node)) {
          const targetNode =
            sourcePanelId === targetPanelId
              ? removeTabFromPanel(node, tabId)
              : node;

          const children = newPanelFirst
            ? [newPanel, targetNode]
            : [targetNode, newPanel];

          return {
            type: "group",
            id: generateId("group"),
            direction: groupDirection,
            children,
          };
        }

        if (
          node.id === sourcePanelId &&
          isLeafNode(node) &&
          sourcePanelId !== targetPanelId
        ) {
          return removeTabFromPanel(node, tabId);
        }

        if (isGroupNode(node)) {
          return {
            ...node,
            children: node.children.map(updateInNode),
          };
        }

        return node;
      };

      setRootWithCleanup(updateInNode(root));
    },

    closeTab: (panelId, tabId) => {
      const { root } = get();
      if (!root) return;

      setRootWithCleanup(
        updateTreeNode(root, panelId, (node) =>
          removeTabFromPanel(node, tabId),
        ),
      );
    },

    cleanupTree: () => {
      const { root } = get();
      if (!root) return;

      set({ root: cleanupNode(root) });
    },

    updateSizes: (groupId, sizes) => {
      const { root } = get();
      if (!root) return;

      set({
        root: updateTreeNode(root, groupId, (node) => {
          if (!isGroupNode(node)) return node;
          return { ...node, sizes };
        }),
      });
    },

    reorderTabs: (panelId, sourceIndex, targetIndex) => {
      const { root } = get();
      if (!root) return;

      set({
        root: updateTreeNode(root, panelId, (node) => {
          if (!isLeafNode(node)) return node;

          const newTabs = [...node.content.tabs];
          const [movedTab] = newTabs.splice(sourceIndex, 1);
          newTabs.splice(targetIndex, 0, movedTab);

          return {
            ...node,
            content: {
              ...node.content,
              tabs: newTabs,
            },
          };
        }),
      });
    },
  };
});
