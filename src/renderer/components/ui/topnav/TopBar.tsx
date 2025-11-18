import {
  ChevronLeftIcon,
  ChevronRightIcon,
  GearIcon,
  MagnifyingGlassIcon,
} from "@radix-ui/react-icons";
import { Box, Flex, IconButton, TextField } from "@radix-ui/themes";
import { useNavigationStore } from "@stores/navigationStore";

interface TopBarProps {
  onSearchClick?: () => void;
}

export const TopBar = ({ onSearchClick }: TopBarProps) => {
  const { goBack, goForward, canGoBack, canGoForward, toggleSettings } =
    useNavigationStore();

  return (
    <Flex
      className="h-10 min-h-10 w-full border-gray-6 border-b"
      align="center"
      justify="between"
      px="2"
      gap="3"
    >
      <Flex gap="1" className="ml-20 flex-shrink-0">
        <IconButton
          size="1"
          variant="ghost"
          onClick={goBack}
          disabled={!canGoBack()}
          className={canGoBack() ? "cursor-pointer" : "cursor-not-allowed"}
        >
          <ChevronLeftIcon />
        </IconButton>
        <IconButton
          size="1"
          variant="ghost"
          onClick={goForward}
          disabled={!canGoForward()}
          className={canGoForward() ? "cursor-pointer" : "cursor-not-allowed"}
        >
          <ChevronRightIcon />
        </IconButton>
      </Flex>
      <Box className="max-w-[500px] flex-1">
        <TextField.Root
          size="1"
          placeholder="Search..."
          onClick={onSearchClick}
          className="cursor-pointer"
          readOnly
        >
          <TextField.Slot>
            <MagnifyingGlassIcon height="14" width="14" />
          </TextField.Slot>
          <TextField.Slot>
            <Box className="text-gray-10 text-xs">⌘P</Box>
          </TextField.Slot>
        </TextField.Root>
      </Box>
      <Flex gap="1">
        <IconButton size="1" variant="ghost" onClick={toggleSettings}>
          <GearIcon />
        </IconButton>
      </Flex>
    </Flex>
  );
};
