import { CampfireToggle } from "@components/CampfireToggle";
import { SettingsToggle } from "@components/SettingsToggle";
import { StatusBarMenu } from "@components/StatusBarMenu";
import { Badge, Box, Code, Flex, Kbd } from "@radix-ui/themes";
import { useStatusBarStore } from "@stores/statusBarStore";

import { IS_DEV } from "@/constants/environment";

interface StatusBarProps {
  showKeyHints?: boolean;
}

export function StatusBar({ showKeyHints = true }: StatusBarProps) {
  const { statusText, keyHints } = useStatusBarStore();

  return (
    <Box
      className="flex flex-row items-center justify-between border-t px-4 py-2"
      style={{ backgroundColor: "var(--gray-2)", borderColor: "var(--gray-6)" }}
    >
      <Flex align="center" gap="2">
        <StatusBarMenu />
        <Code size="1" variant="ghost" color="gray">
          {statusText && "- "}
          {statusText}
        </Code>
      </Flex>

      {showKeyHints && (
        <Flex
          align="center"
          gap="3"
          style={{
            position: "absolute",
            left: "50%",
            transform: "translateX(-50%)",
          }}
        >
          {keyHints.map((hint) => (
            <Flex key={hint.description} align="center" gap="2">
              <Kbd size="1">{hint.keys.join("")}</Kbd>
              <Code size="1" variant="ghost" color="gray">
                {hint.description}
              </Code>
            </Flex>
          ))}
        </Flex>
      )}

      <Flex align="center" gap="2">
        <CampfireToggle />
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
