import { CampfireToggle } from "@components/CampfireToggle";
import { FeedbackToggle } from "@components/FeedbackToggle";
import { SettingsToggle } from "@components/SettingsToggle";
import { StatusBarMenu } from "@components/StatusBarMenu";
import { KeyHint } from "@components/ui/KeyHint";
import { Badge, Box, Code, Flex } from "@radix-ui/themes";

import { IS_DEV } from "@/constants/environment";

export function StatusBar() {
  return (
    <Box
      className="flex flex-row items-center justify-between border-t px-4"
      style={{
        backgroundColor: "var(--gray-2)",
        borderColor: "var(--gray-6)",
        height: 26,
      }}
    >
      <Flex align="center" gap="2">
        <StatusBarMenu />
      </Flex>

      <Flex
        align="center"
        gap="2"
        style={{
          position: "absolute",
          left: "50%",
          transform: "translateX(-50%)",
        }}
      >
        <KeyHint>
          {navigator.platform.includes("Mac") ? "⌘K" : "Ctrl+K"}
        </KeyHint>
        <Code size="1" variant="ghost" color="gray">
          Command
        </Code>
      </Flex>

      <Flex align="center" gap="2">
        <CampfireToggle />
        <FeedbackToggle />
        <SettingsToggle />
        {IS_DEV && (
          <Badge size="1">
            <Code size="1" variant="ghost">
              DEV
            </Code>
          </Badge>
        )}
      </Flex>
    </Box>
  );
}
