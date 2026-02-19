import { Flex, Text } from "@radix-ui/themes";
import type { ReactNode } from "react";

interface FeatureListItemProps {
  icon: ReactNode;
  title: string;
  description: string;
  isActive: boolean;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
}

export function FeatureListItem({
  icon,
  title,
  description,
  isActive,
  onMouseEnter,
  onMouseLeave,
}: FeatureListItemProps) {
  return (
    <Flex
      align="start"
      gap="3"
      py="3"
      px="4"
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      style={{
        borderLeft: `3px solid ${isActive ? "var(--accent-9)" : "transparent"}`,
        backgroundColor: isActive ? "rgba(255, 140, 60, 0.08)" : "transparent",
        cursor: "pointer",
        transition: "all 0.2s ease",
      }}
    >
      <Flex
        align="center"
        justify="center"
        style={{
          color: isActive ? "var(--accent-9)" : "var(--cave-charcoal)",
          opacity: isActive ? 1 : 0.6,
          transition: "all 0.2s ease",
          flexShrink: 0,
          marginTop: 2,
        }}
      >
        {icon}
      </Flex>
      <Flex direction="column" gap="1">
        <Text
          size="3"
          weight={isActive ? "bold" : "medium"}
          style={{
            color: "var(--cave-charcoal)",
            transition: "all 0.2s ease",
          }}
        >
          {title}
        </Text>
        <Text
          size="2"
          style={{
            color: "var(--cave-charcoal)",
            opacity: isActive ? 0.7 : 0.5,
            transition: "all 0.2s ease",
          }}
        >
          {description}
        </Text>
      </Flex>
    </Flex>
  );
}
