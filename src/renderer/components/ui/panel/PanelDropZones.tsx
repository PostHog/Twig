import { useDroppable } from "@dnd-kit/react";
import { Box } from "@radix-ui/themes";
import type { SplitDirection } from "@stores/panelStore";
import type React from "react";

type DropZoneType = SplitDirection | "center";

interface PanelDropZonesProps {
  panelId: string;
  isDragging: boolean;
}

interface DropZoneProps {
  panelId: string;
  zone: DropZoneType;
  style: React.CSSProperties;
}

const DropZone: React.FC<DropZoneProps> = ({ panelId, zone, style }) => {
  const { ref, isDropTarget } = useDroppable({
    id: `drop-${panelId}-${zone}`,
    data: { panelId, zone, type: "panel" },
  });

  return (
    <Box
      ref={ref}
      className={`drop-zone drop-zone-${zone} pointer-events-auto absolute z-[100] transition-all duration-150 ${
        isDropTarget ? "border-2 opacity-50" : "border-0 opacity-10"
      }`}
      style={{
        ...style,
        backgroundColor: isDropTarget ? "var(--accent-9)" : "var(--gray-5)",
        borderColor: isDropTarget ? "var(--accent-9)" : "transparent",
      }}
    />
  );
};

const ZONE_SIZE = "20%";

const ZONE_CONFIGS: Array<{ zone: DropZoneType; style: React.CSSProperties }> =
  [
    {
      zone: "top",
      style: { top: 0, left: 0, right: 0, height: ZONE_SIZE },
    },
    {
      zone: "bottom",
      style: { bottom: 0, left: 0, right: 0, height: ZONE_SIZE },
    },
    {
      zone: "left",
      style: { top: 0, left: 0, bottom: 0, width: ZONE_SIZE },
    },
    {
      zone: "right",
      style: { top: 0, right: 0, bottom: 0, width: ZONE_SIZE },
    },
    {
      zone: "center",
      style: {
        top: ZONE_SIZE,
        left: ZONE_SIZE,
        right: ZONE_SIZE,
        bottom: ZONE_SIZE,
      },
    },
  ];

export const PanelDropZones: React.FC<PanelDropZonesProps> = ({
  panelId,
  isDragging,
}) => {
  if (!isDragging) return null;

  return (
    <Box
      style={{
        position: "absolute",
        inset: 0,
        pointerEvents: "none",
        zIndex: 100,
      }}
    >
      {ZONE_CONFIGS.map(({ zone, style }) => (
        <DropZone key={zone} panelId={panelId} zone={zone} style={style} />
      ))}
    </Box>
  );
};
