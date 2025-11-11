import { Box, Flex, IconButton, TextField } from '@radix-ui/themes'
import { ChevronLeftIcon, ChevronRightIcon, MagnifyingGlassIcon, GearIcon } from '@radix-ui/react-icons'
import { useNavigationStore } from '@stores/navigationStore'

interface TopBarProps {
    onSearchClick?: () => void
}

export const TopBar = ({ onSearchClick }: TopBarProps) => {
    const { goBack, goForward, canGoBack, canGoForward, toggleSettings } = useNavigationStore()

    return (
        <Flex className="w-full h-10 border-b border-gray-6" align="center" justify="between" px="2" gap="3">
                <Flex gap="1" className="flex-shrink-0 ml-20">
                    <IconButton
                        size="1"
                        variant="ghost"
                        onClick={goBack}
                        disabled={!canGoBack()}
                        className={canGoBack() ? 'cursor-pointer' : 'cursor-not-allowed'}
                    >
                        <ChevronLeftIcon />
                    </IconButton>
                    <IconButton
                        size="1"
                        variant="ghost"
                        onClick={goForward}
                        disabled={!canGoForward()}
                        className={canGoForward() ? 'cursor-pointer' : 'cursor-not-allowed'}
                    >
                        <ChevronRightIcon />
                    </IconButton>
                </Flex>
            <Box className="flex-1 max-w-[500px]">
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
                        <Box className="text-xs text-gray-10">⌘P</Box>
                    </TextField.Slot>
                </TextField.Root>
            </Box>
            <Flex gap="1">
                <IconButton
                    size="1"
                    variant="ghost"
                    onClick={toggleSettings}
                >
                    <GearIcon />
                </IconButton>
            </Flex>
        </Flex>
    )
}