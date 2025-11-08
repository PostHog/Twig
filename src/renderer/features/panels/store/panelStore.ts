import { create } from "zustand";
import {
  addTabToPanel,
  cleanupNode,
  findTabInPanel,
  isLeaf,
  removeTabFromPanel,
  setActiveTabInPanel,
  updateTreeNode,
} from "./panelTree";
import type {
  GroupId,
  PanelId,
  PanelNode,
  SplitDirection,
  TabId,
} from "./panelTypes";
import { calculateSplitSizes } from "./panelUtils";

interface DragState {
  draggingTabId: TabId | null;
  draggingTabPanelId: PanelId | null;
}

interface TreeState {
  root: PanelNode | null;
  idCounter: number;
}

interface TreeActions {
  setRoot: (root: PanelNode) => void;
  findPanel: (id: PanelId, node?: PanelNode) => PanelNode | null;
  cleanupTree: () => void;
}

interface TabActions {
  setDraggingTab: (tabId: TabId | null, panelId: PanelId | null) => void;
  moveTab: (
    tabId: TabId,
    sourcePanelId: PanelId,
    targetPanelId: PanelId,
  ) => void;
  setActiveTab: (panelId: PanelId, tabId: TabId) => void;
  closeTab: (panelId: PanelId, tabId: TabId) => void;
  reorderTabs: (
    panelId: PanelId,
    sourceIndex: number,
    targetIndex: number,
  ) => void;
}

interface PanelActions {
  splitPanel: (
    tabId: TabId,
    sourcePanelId: PanelId,
    targetPanelId: PanelId,
    direction: SplitDirection,
  ) => void;
  updateSizes: (groupId: GroupId, sizes: number[]) => void;
}

type PanelStore = TreeState &
  DragState &
  TreeActions &
  TabActions &
  PanelActions;

export const usePanelStore = create<PanelStore>((set, get) => {
  const generateId = (prefix: string): string => {
    const id = `${prefix}-gen-${get().idCounter}`;
    set((state) => ({ idCounter: state.idCounter + 1 }));
    return id;
  };

  const setRootWithCleanup = (root: PanelNode | null) => {
    set({ root: root ? cleanupNode(root) : null });
  };

  const getLeafPanel = (
    panelId: PanelId,
  ): Extract<PanelNode, { type: "leaf" }> | null => {
    const panel = get().findPanel(panelId);
    return isLeaf(panel) ? panel : null;
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

      if (searchNode.type === "group") {
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

      const isVerticalSplit = direction === "top" || direction === "bottom";
      const newPanelFirst = direction === "top" || direction === "left";
      const splitSizes = calculateSplitSizes();

      const newPanel: PanelNode = {
        type: "leaf",
        id: generateId("panel"),
        content: {
          id: generateId("panel"),
          tabs: [tabToMove],
          activeTabId: tabToMove.id,
          showTabs: true,
          droppable: true,
        },
      };

      const updateInNode = (node: PanelNode): PanelNode => {
        if (node.id === targetPanelId && isLeaf(node)) {
          const targetNode =
            sourcePanelId === targetPanelId
              ? removeTabFromPanel(node, tabId)
              : node;

          const children = newPanelFirst
            ? [newPanel, targetNode]
            : [targetNode, newPanel];

          const sizes = newPanelFirst
            ? splitSizes
            : [splitSizes[1], splitSizes[0]];

          return {
            type: "group",
            id: generateId("group"),
            direction: isVerticalSplit ? "vertical" : "horizontal",
            children,
            sizes,
          };
        }

        if (
          node.id === sourcePanelId &&
          isLeaf(node) &&
          sourcePanelId !== targetPanelId
        ) {
          return removeTabFromPanel(node, tabId);
        }

        if (node.type === "group") {
          return { ...node, children: node.children.map(updateInNode) };
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
          if (node.type !== "group") return node;
          return { ...node, sizes };
        }),
      });
    },

    reorderTabs: (panelId, sourceIndex, targetIndex) => {
      const { root } = get();
      if (!root) return;

      set({
        root: updateTreeNode(root, panelId, (node) => {
          if (!isLeaf(node)) return node;

          const newTabs = [...node.content.tabs];
          const [movedTab] = newTabs.splice(sourceIndex, 1);
          newTabs.splice(targetIndex, 0, movedTab);

          return {
            ...node,
            content: { ...node.content, tabs: newTabs },
          };
        }),
      });
    },
  };
});

export type {
  PanelContent,
  PanelNode,
  SplitDirection,
  Tab,
} from "./panelTypes";
