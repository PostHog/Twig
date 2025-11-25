import type { TreeLine, TreeNode } from "@components/ui/sidebar/Types";

function generateNodeId(
  nodeIdFromNode: string | undefined,
  parentId: string,
  index: number,
): string {
  if (nodeIdFromNode) {
    return parentId ? `${parentId}.${nodeIdFromNode}` : nodeIdFromNode;
  }
  return parentId ? `${parentId}.${index}` : `${index}`;
}

function getTreeConnector(isRoot: boolean, isLastNode: boolean): string {
  if (isRoot) return "";
  return isLastNode ? "└─ " : "├─ ";
}

function getChildPrefix(
  isRoot: boolean,
  prefix: string,
  isLastNode: boolean,
): string {
  if (isRoot) return "";
  return prefix + (isLastNode ? "   " : "│  ");
}

function createTreeLine(
  node: TreeNode,
  prefix: string,
  connector: string,
  nodeId: string,
  hasChildren: boolean,
): TreeLine {
  return {
    prefix,
    connector,
    label: node.label,
    nodeId,
    hasChildren,
    icon: node.icon,
    action: node.action,
    isActive: node.isActive,
    hoverAction: node.hoverAction,
    hoverIcon: node.hoverIcon,
    showHoverIconAlways: node.showHoverIconAlways,
    tooltip: node.tooltip,
    customColor: node.customColor,
    onContextMenu: node.onContextMenu,
    isRootHeader: node.isRootHeader,
    addSpacingBefore: node.addSpacingBefore,
  };
}

function createSeparatorLine(prefix: string, nodeId: string): TreeLine {
  return {
    prefix,
    connector: "│",
    label: "",
    nodeId: `${nodeId}-sep`,
    hasChildren: false,
  };
}

function shouldExpandNode(
  node: TreeNode,
  nodeId: string,
  expandedNodes: Set<string>,
): boolean {
  return node.isRootHeader || expandedNodes.has(nodeId);
}

function shouldAddSeparator(
  isRoot: boolean,
  hasChildren: boolean,
  node: TreeNode,
  isLastNode: boolean,
): boolean {
  return !isRoot && !hasChildren && !!node.forceSeparator && !isLastNode;
}

export function buildTreeLines(
  nodes: TreeNode[],
  prefix = "",
  parentId = "",
  expandedNodes: Set<string>,
  depth = 0,
): TreeLine[] {
  const lines: TreeLine[] = [];
  const isRoot = depth === 0;

  nodes.forEach((node, index) => {
    const isLastNode = index === nodes.length - 1;
    const nodeId = generateNodeId(node.id, parentId, index);
    const hasChildren = !!(node.children && node.children.length > 0);
    const connector = getTreeConnector(isRoot, isLastNode);

    lines.push(createTreeLine(node, prefix, connector, nodeId, hasChildren));

    if (
      hasChildren &&
      node.children &&
      shouldExpandNode(node, nodeId, expandedNodes)
    ) {
      const childPrefix = getChildPrefix(isRoot, prefix, isLastNode);
      lines.push(
        ...buildTreeLines(
          node.children,
          childPrefix,
          nodeId,
          expandedNodes,
          depth + 1,
        ),
      );
    }

    if (shouldAddSeparator(isRoot, hasChildren, node, isLastNode)) {
      lines.push(createSeparatorLine(prefix, nodeId));
    }
  });

  return lines;
}

export function getAllNodeIds(
  nodes: TreeNode[],
  parentId = "",
  depth = 0,
): string[] {
  const nodeIds: string[] = [];

  nodes.forEach((node, index) => {
    const nodeId = generateNodeId(node.id, parentId, index);
    const hasChildren = !!(node.children && node.children.length > 0);

    if (hasChildren) {
      nodeIds.push(nodeId);
      if (node.children) {
        nodeIds.push(...getAllNodeIds(node.children, nodeId, depth + 1));
      }
    }
  });

  return nodeIds;
}
