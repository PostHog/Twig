import { Copy, MagnifyingGlass } from "@phosphor-icons/react";
import { Box, Flex, IconButton, Text, TextField } from "@radix-ui/themes";
import type { RefObject } from "react";

interface RawLogsHeaderProps {
  filteredCount: number;
  totalCount: number;
  searchQuery: string;
  showSearch: boolean;
  onToggleSearch: () => void;
  onCopyAll: () => void;
  onSearchChange: (query: string) => void;
  searchInputRef: RefObject<HTMLInputElement | null>;
}

export function RawLogsHeader({
  filteredCount,
  totalCount,
  searchQuery,
  showSearch,
  onToggleSearch,
  onCopyAll,
  onSearchChange,
  searchInputRef,
}: RawLogsHeaderProps) {
  return (
    <Box className="p-4 pb-2">
      <Flex direction="column" gap="2">
        <Flex justify="between" align="center">
          <Text size="2" weight="medium" color="gray">
            Raw Logs ({filteredCount}
            {searchQuery && ` of ${totalCount}`} events)
          </Text>
          <Flex gap="1">
            <IconButton
              size="1"
              variant="ghost"
              color="gray"
              onClick={() => {
                onToggleSearch();
                if (!showSearch) {
                  setTimeout(() => searchInputRef.current?.focus(), 0);
                }
              }}
            >
              <MagnifyingGlass size={12} />
            </IconButton>
            <IconButton
              size="1"
              variant="ghost"
              color="gray"
              onClick={onCopyAll}
            >
              <Copy size={12} />
            </IconButton>
          </Flex>
        </Flex>
        {showSearch && (
          <TextField.Root
            ref={searchInputRef}
            size="1"
            placeholder="Search logs... (Esc to close)"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
          >
            <TextField.Slot>
              <MagnifyingGlass size={12} />
            </TextField.Slot>
          </TextField.Root>
        )}
      </Flex>
    </Box>
  );
}
