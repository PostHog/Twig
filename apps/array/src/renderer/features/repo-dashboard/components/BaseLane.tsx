import { DotPattern } from "@components/ui/DotPattern";
import { SidebarSimple } from "@phosphor-icons/react";
import { Box, Flex, IconButton, Text } from "@radix-ui/themes";
import type { ReactNode } from "react";
import { useId, useState } from "react";

interface BaseLaneProps {
  name: string;
  itemCount: number;
  children: ReactNode;
  /** Content rendered in the header after the title */
  headerActions?: ReactNode;
  /** Content rendered in a section below the header */
  subHeader?: ReactNode;
  /** Empty state message */
  emptyMessage?: string;
  /** Style overrides for the container */
  containerStyle?: React.CSSProperties;
  /** Style overrides for the header */
  headerStyle?: React.CSSProperties;
  /** Style overrides for the collapsed state */
  collapsedStyle?: React.CSSProperties;
  /** Ref for the container (used for droppable) */
  containerRef?: React.Ref<HTMLDivElement>;
  /** Show dot pattern background in empty state */
  showDotPattern?: boolean;
  /** Called when the title is clicked */
  onTitleClick?: () => void;
  /** Custom stats content for collapsed state (replaces default badge) */
  collapsedStats?: ReactNode;
}

export function BaseLane({
  name,
  itemCount,
  children,
  headerActions,
  subHeader,
  emptyMessage = "No changes",
  containerStyle,
  headerStyle,
  collapsedStyle,
  containerRef,
  showDotPattern = false,
  onTitleClick,
  collapsedStats,
}: BaseLaneProps) {
  const [collapsed, setCollapsed] = useState(false);
  const patternId = useId();

  if (collapsed) {
    return (
      <Flex
        direction="column"
        align="center"
        gap="2"
        py="2"
        style={{
          width: "32px",
          minWidth: "32px",
          height: "100%",
          borderRight: "1px solid var(--gray-5)",
          backgroundColor: "var(--color-background)",
          cursor: "pointer",
          ...collapsedStyle,
        }}
        onClick={() => setCollapsed(false)}
      >
        <IconButton size="1" variant="ghost" color="gray">
          <SidebarSimple size={16} />
        </IconButton>
        <Text
          size="1"
          weight="medium"
          style={{
            writingMode: "vertical-rl",
            textOrientation: "mixed",
            color: "var(--gray-11)",
            letterSpacing: "0.5px",
          }}
        >
          {name}
        </Text>
        {collapsedStats}
      </Flex>
    );
  }

  return (
    <Flex
      ref={containerRef}
      direction="column"
      style={{
        width: "288px",
        minWidth: "288px",
        height: "100%",
        borderRight: "1px solid var(--gray-5)",
        ...containerStyle,
      }}
    >
      {/* Header */}
      <Flex
        align="center"
        justify="between"
        px="3"
        py="2"
        style={{
          borderBottom: "1px solid var(--gray-5)",
          ...headerStyle,
        }}
      >
        <Flex align="center" gap="2">
          <IconButton
            size="1"
            variant="ghost"
            color="gray"
            onClick={() => setCollapsed(true)}
          >
            <SidebarSimple size={14} />
          </IconButton>
          <Text
            weight="medium"
            size="1"
            truncate
            onClick={onTitleClick}
            style={onTitleClick ? { cursor: "pointer" } : undefined}
          >
            {name}
          </Text>
        </Flex>
        {headerActions ?? <div style={{ width: "24px" }} />}
      </Flex>

      {/* Sub-header section */}
      {subHeader}

      {/* File List */}
      <Box style={{ flex: 1, position: "relative", overflow: "hidden" }}>
        {showDotPattern && itemCount === 0 && (
          <DotPattern
            id={`lane-${patternId}`}
            opacity={0.5}
            color="var(--gray-5)"
          />
        )}
        <Flex
          direction="column"
          py="2"
          style={{ position: "relative", zIndex: 1 }}
        >
          {itemCount === 0 ? (
            <Flex align="center" justify="center" py="6" px="3">
              <Text size="1" color="gray" align="center">
                {emptyMessage}
              </Text>
            </Flex>
          ) : (
            children
          )}
        </Flex>
      </Box>
    </Flex>
  );
}
