export type PanelId = string;
export type TabId = string;
export type GroupId = string;

export type Tab = {
  id: TabId;
  label: string;
  component?: React.ReactNode;
  closeable?: boolean;
  draggable?: boolean;
  onClose?: () => void;
  onSelect?: () => void;
  icon?: React.ReactNode;
};

export type PanelContent = {
  id: PanelId;
  tabs: Tab[];
  activeTabId: TabId;
  showTabs?: boolean;
  droppable?: boolean;
};

export type LeafPanel = {
  type: "leaf";
  id: PanelId;
  content: PanelContent;
  size?: number;
};

export type GroupPanel = {
  type: "group";
  id: GroupId;
  direction: "horizontal" | "vertical";
  children: PanelNode[];
  sizes?: number[];
};

export type PanelNode = LeafPanel | GroupPanel;

export type SplitDirection = "top" | "bottom" | "left" | "right";
