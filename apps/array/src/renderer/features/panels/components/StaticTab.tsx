import { Box, Button, Flex, Text } from "@radix-ui/themes";
import type React from "react";

interface StaticTabProps {
  label: string;
  isActive: boolean;
  onSelect: () => void;
  icon?: React.ReactNode;
  badge?: React.ReactNode;
  hasUnsavedChanges?: boolean;
}

export const StaticTab: React.FC<StaticTabProps> = ({
  label,
  isActive,
  onSelect,
  icon,
  badge,
  hasUnsavedChanges,
}) => {
  return (
    <Flex align="center" flexShrink="0" ml="2" mr="2" px="2" py="1">
      <Button
        variant="ghost"
        color="gray"
        size="1"
        onClick={onSelect}
        style={{
          backgroundColor: isActive ? "var(--gray-a3)" : undefined,
        }}
      >
        {icon && (
          <Box style={{ display: "flex", alignItems: "center" }}>{icon}</Box>
        )}
        {label}
        {badge}
        {hasUnsavedChanges && (
          <Text size="1" style={{ color: "var(--amber-9)" }}>
            •
          </Text>
        )}
      </Button>
    </Flex>
  );
};
