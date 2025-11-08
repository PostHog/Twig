import React from "react";
import type { PanelNode, Tab } from "../store/panelStore";

/**
 * JSX-based panel tree builder.
 * Use these components to declaratively define panel layouts.
 *
 * Example:
 * <PanelGroupTree direction="horizontal" sizes={[75, 25]}>
 *   <PanelLeaf>
 *     <PanelTab id="logs">{logsContent}</PanelTab>
 *   </PanelLeaf>
 *   <PanelLeaf showTabs={false}>{content}</PanelLeaf>
 * </PanelGroupTree>
 */

export interface PanelGroupTreeProps {
  direction: "horizontal" | "vertical";
  sizes?: number[];
  children: React.ReactNode;
}

export interface PanelLeafProps {
  showTabs?: boolean;
  droppable?: boolean;
  children: React.ReactNode;
}

export interface PanelTabProps {
  id?: string;
  label?: string;
  icon?: React.ReactNode;
  closeable?: boolean;
  onClose?: () => void;
  onSelect?: () => void;
  children: React.ReactNode;
}

export const PanelGroupTree: React.FC<PanelGroupTreeProps> = ({ children }) => {
  return <>{children}</>;
};

export const PanelLeaf: React.FC<PanelLeafProps> = ({ children }) => {
  return <>{children}</>;
};

export const PanelTab: React.FC<PanelTabProps> = ({ children }) => {
  return <>{children}</>;
};

function isPanelGroupTree(
  element: React.ReactNode,
): element is React.ReactElement<PanelGroupTreeProps> {
  return React.isValidElement(element) && element.type === PanelGroupTree;
}

function isPanelLeaf(
  element: React.ReactNode,
): element is React.ReactElement<PanelLeafProps> {
  return React.isValidElement(element) && element.type === PanelLeaf;
}

function isPanelTab(
  element: React.ReactNode,
): element is React.ReactElement<PanelTabProps> {
  return React.isValidElement(element) && element.type === PanelTab;
}

function compileNode(element: React.ReactElement, path: string): PanelNode {
  if (isPanelGroupTree(element)) {
    const { direction, sizes, children } = element.props;
    const childArray = React.Children.toArray(children);

    return {
      type: "group",
      id: path,
      direction,
      children: childArray.map((child, index) =>
        compileNode(child as React.ReactElement, `${path}-${index}`),
      ),
      ...(sizes && { sizes }),
    };
  }

  if (isPanelLeaf(element)) {
    const { showTabs = true, droppable = true, children } = element.props;
    const childArray = React.Children.toArray(children);

    const tabs: Tab[] = [];
    let firstTabId: string | null = null;

    childArray.forEach((child, index) => {
      if (isPanelTab(child)) {
        const {
          id,
          label,
          icon,
          closeable,
          onClose,
          onSelect,
          children: component,
        } = child.props;
        const tabId = id || `${path}-tab-${index}`;

        if (!firstTabId) firstTabId = tabId;

        tabs.push({
          id: tabId,
          label: label || tabId,
          component,
          closeable,
          onClose,
          onSelect,
          icon,
        });
      } else {
        const tabId = `${path}-tab-${index}`;
        if (!firstTabId) firstTabId = tabId;

        tabs.push({
          id: tabId,
          label: tabId,
          component: child,
        });
      }
    });

    return {
      type: "leaf",
      id: path,
      content: {
        id: path,
        tabs,
        activeTabId: firstTabId || "",
        showTabs,
        droppable,
      },
    };
  }

  throw new Error(
    "Invalid panel tree structure. Expected PanelGroupTree or PanelLeaf.",
  );
}

export function compilePanelTree(element: React.ReactElement): PanelNode {
  return compileNode(element, "panel-0");
}
