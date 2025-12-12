import type { GitFileStatus } from "@shared/types";

export type PanelId = string;
export type TabId = string;
export type GroupId = string;

/**
 * Discriminated union for tab-specific data
 * Each tab type can carry its own typed data
 */
export type TabData =
  | {
      type: "file";
      relativePath: string;
      absolutePath: string;
      repoPath: string;
    }
  | {
      type: "diff";
      relativePath: string;
      absolutePath: string;
      repoPath: string;
      status: GitFileStatus;
    }
  | {
      type: "terminal";
      terminalId: string;
      cwd: string;
    }
  | {
      type: "workspace-terminal";
      sessionId: string;
      command: string;
      scriptType: "init" | "start";
    }
  | {
      type: "logs";
    }
  | {
      type: "other";
      // Generic tab without specific data
    };

export type Tab = {
  id: TabId;
  label: string;
  data: TabData;
  component?: React.ReactNode;
  closeable?: boolean;
  draggable?: boolean;
  onClose?: () => void;
  onSelect?: () => void;
  icon?: React.ReactNode;
  hasUnsavedChanges?: boolean;
  badge?: React.ReactNode;
  isPreview?: boolean;
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
