export interface TreeNode {
  label: string;
  id?: string;
  children?: TreeNode[];
  icon?: React.ReactNode;
  forceSeparator?: boolean;
  action?: () => void;
  isActive?: boolean;
  hoverAction?: () => void;
  hoverIcon?: React.ReactNode;
  showHoverIconAlways?: boolean;
  tooltip?: string;
  customColor?: string;
  onContextMenu?: (e: React.MouseEvent) => void;
  isRootHeader?: boolean;
  addSpacingBefore?: boolean;
}

export interface TreeLine {
  prefix: string;
  connector: string;
  label: string;
  nodeId: string;
  hasChildren: boolean;
  icon?: React.ReactNode;
  action?: () => void;
  isActive?: boolean;
  hoverAction?: () => void;
  hoverIcon?: React.ReactNode;
  showHoverIconAlways?: boolean;
  tooltip?: string;
  customColor?: string;
  onContextMenu?: (e: React.MouseEvent) => void;
  isRootHeader?: boolean;
  addSpacingBefore?: boolean;
}
