import type React from "react";
import { DraggableTab } from "./DraggableTab";
import { StaticTab } from "./StaticTab";

interface PanelTabProps {
  tabId: string;
  panelId: string;
  label: string;
  isActive: boolean;
  index: number;
  draggable?: boolean;
  onSelect: () => void;
  onClose?: () => void;
  icon?: React.ReactNode;
  badge?: React.ReactNode;
  hasUnsavedChanges?: boolean;
}

export const PanelTab: React.FC<PanelTabProps> = ({
  tabId,
  panelId,
  label,
  isActive,
  index,
  draggable = true,
  onSelect,
  onClose,
  icon,
  badge,
  hasUnsavedChanges,
}) => {
  if (!draggable) {
    return (
      <StaticTab
        label={label}
        isActive={isActive}
        onSelect={onSelect}
        icon={icon}
        badge={badge}
        hasUnsavedChanges={hasUnsavedChanges}
      />
    );
  }

  return (
    <DraggableTab
      tabId={tabId}
      panelId={panelId}
      label={label}
      isActive={isActive}
      index={index}
      onSelect={onSelect}
      onClose={onClose}
      icon={icon}
      badge={badge}
      hasUnsavedChanges={hasUnsavedChanges}
    />
  );
};
