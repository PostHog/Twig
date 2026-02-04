import { Flex, Text } from "@radix-ui/themes";
import type { ReactNode } from "react";

interface SettingRowProps {
  label: string;
  description?: ReactNode;
  children: ReactNode;
  noBorder?: boolean;
}

export function SettingRow({
  label,
  description,
  children,
  noBorder = false,
}: SettingRowProps) {
  return (
    <Flex
      align="center"
      justify="between"
      py="4"
      gap="6"
      style={{
        borderBottom: noBorder ? undefined : "1px solid var(--gray-5)",
      }}
    >
      <Flex direction="column" gap="1" style={{ maxWidth: "60%" }}>
        <Text size="2" weight="medium">
          {label}
        </Text>
        {description &&
          (typeof description === "string" ? (
            <Text size="1" color="gray">
              {description}
            </Text>
          ) : (
            description
          ))}
      </Flex>
      <div className="shrink-0">{children}</div>
    </Flex>
  );
}
