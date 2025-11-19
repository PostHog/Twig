import { SidebarTrigger } from "@components/ui/sidebar/SidebarTrigger";
import { MagnifyingGlassIcon } from "@radix-ui/react-icons";
import { Box, Flex, TextField } from "@radix-ui/themes";

interface TopBarProps {
  onSearchClick?: () => void;
}

export const TopBar = ({ onSearchClick }: TopBarProps) => {
  return (
    <Flex
      className="drag h-10 w-full border-gray-6 border-b"
      align="center"
      justify="center"
      px="2"
      gap="3"
      position="relative"
    >
      <Flex
        gap="1"
        className="no-drag ml-20 flex-shrink-0"
        style={{ position: "absolute", left: "8px" }}
      >
        <SidebarTrigger />
      </Flex>
      <Box
        className="no-drag w-[600px] max-w-[600px]"
        onClick={onSearchClick}
        style={{ cursor: "pointer" }}
      >
        <TextField.Root
          size="1"
          placeholder="Search..."
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
    </Flex>
  );
};
