import { CampfireToggle } from "@components/CampfireToggle";
import { FeedbackToggle } from "@components/FeedbackToggle";
import { SettingsToggle } from "@components/SettingsToggle";
import { StatusBarMenu } from "@components/StatusBarMenu";
import { Badge, Box, Code, Flex, Kbd } from "@radix-ui/themes";

import { IS_DEV } from "@/constants/environment";

export function StatusBar() {
  return (
    <Box
      className="flex flex-row items-center justify-between border-t px-4 py-2"
      style={{ backgroundColor: "var(--gray-2)", borderColor: "var(--gray-6)" }}
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
        <Kbd size="1">
          {navigator.platform.includes("Mac") ? "\u2318" : "Ctrl"}K
        </Kbd>
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
