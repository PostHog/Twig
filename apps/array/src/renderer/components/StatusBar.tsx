import { StatusBarMenu } from "@components/StatusBarMenu";
import { GearIcon } from "@radix-ui/react-icons";
import { Badge, Box, Code, Flex, IconButton, Kbd } from "@radix-ui/themes";
import { useNavigationStore } from "@stores/navigationStore";
import { useStatusBarStore } from "@stores/statusBarStore";

import { IS_DEV } from "@/constants/environment";

interface StatusBarProps {
  showKeyHints?: boolean;
}

export function StatusBar({ showKeyHints = true }: StatusBarProps) {
  const { statusText, keyHints } = useStatusBarStore();
  const { toggleSettings } = useNavigationStore();

  return (
    <Box className="flex flex-row items-center justify-between border-gray-6 border-t bg-gray-2 px-4 py-2">
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
        <IconButton
          size="1"
          variant="ghost"
          color="gray"
          onClick={toggleSettings}
          title="Settings"
        >
          <GearIcon />
        </IconButton>
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
