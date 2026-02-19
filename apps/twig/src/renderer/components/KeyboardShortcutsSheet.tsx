import { Box, Dialog, Flex, Kbd, Text } from "@radix-ui/themes";
import {
  CATEGORY_LABELS,
  formatHotkey,
  getShortcutsByCategory,
  type ShortcutCategory,
} from "@renderer/constants/keyboard-shortcuts";
import { isMac } from "@utils/platform";
import { useMemo } from "react";

interface KeyboardShortcutsSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function KeyboardShortcutsSheet({
  open,
  onOpenChange,
}: KeyboardShortcutsSheetProps) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Content
        maxWidth="600px"
        style={{ maxHeight: "80vh", overflow: "hidden" }}
      >
        <Dialog.Title size="4" mb="4">
          Keyboard Shortcuts
        </Dialog.Title>

        <Box
          style={{
            overflowY: "auto",
            maxHeight: "calc(80vh - 100px)",
            paddingRight: "8px",
          }}
        >
          <KeyboardShortcutsList />
        </Box>

        <Flex justify="end" mt="4">
          <Dialog.Close>
            <Text
              size="1"
              color="gray"
              style={{ cursor: "pointer" }}
              onClick={() => onOpenChange(false)}
            >
              Press <Kbd size="1">Esc</Kbd> to close
            </Text>
          </Dialog.Close>
        </Flex>
      </Dialog.Content>
    </Dialog.Root>
  );
}

export function KeyboardShortcutsList() {
  const shortcutsByCategory = useMemo(() => getShortcutsByCategory(), []);

  const categoryOrder: ShortcutCategory[] = [
    "general",
    "navigation",
    "panels",
    "editor",
  ];

  return (
    <Flex direction="column" gap="5">
      {categoryOrder.map((category) => {
        const shortcuts = shortcutsByCategory[category];
        if (shortcuts.length === 0) return null;

        const uniqueShortcuts = shortcuts.reduce(
          (acc, shortcut) => {
            const existing = acc.find(
              (s) => s.description === shortcut.description,
            );
            if (existing) {
              return acc;
            }
            return [...acc, shortcut];
          },
          [] as typeof shortcuts,
        );

        return (
          <Flex key={category} direction="column" gap="2">
            <Text size="2" weight="bold" color="gray">
              {CATEGORY_LABELS[category]}
            </Text>
            <Box
              style={{
                borderRadius: "var(--radius-2)",
                border: "1px solid var(--gray-5)",
                overflow: "hidden",
              }}
            >
              {uniqueShortcuts.map((shortcut, index) => (
                <Flex
                  key={shortcut.id}
                  align="center"
                  justify="between"
                  px="3"
                  py="2"
                  style={{
                    borderBottom:
                      index < uniqueShortcuts.length - 1
                        ? "1px solid var(--gray-4)"
                        : undefined,
                    backgroundColor:
                      index % 2 === 0 ? "var(--gray-2)" : "var(--gray-1)",
                  }}
                >
                  <Flex direction="column" gap="1">
                    <Text size="2">{shortcut.description}</Text>
                    {shortcut.context && (
                      <Text size="1" color="gray">
                        {shortcut.context}
                      </Text>
                    )}
                  </Flex>
                  <ShortcutKeys
                    keys={shortcut.keys}
                    alternateKeys={shortcut.alternateKeys}
                  />
                </Flex>
              ))}
            </Box>
          </Flex>
        );
      })}
    </Flex>
  );
}

function SingleShortcutKeys({ keys }: { keys: string }) {
  const formatted = formatHotkey(keys);

  if (isMac) {
    return (
      <Kbd size="2" style={{ fontFamily: "system-ui" }}>
        {formatted}
      </Kbd>
    );
  }

  const keyParts = formatted.split("+");
  return (
    <Flex gap="1" align="center">
      {keyParts.map((part) => (
        <Kbd key={part} size="2">
          {part}
        </Kbd>
      ))}
    </Flex>
  );
}

function ShortcutKeys({
  keys,
  alternateKeys,
}: {
  keys: string;
  alternateKeys?: string;
}) {
  if (!alternateKeys) {
    return <SingleShortcutKeys keys={keys} />;
  }

  return (
    <Flex gap="1" align="center">
      <SingleShortcutKeys keys={keys} />
      <Text size="1" color="gray">
        or
      </Text>
      <SingleShortcutKeys keys={alternateKeys} />
    </Flex>
  );
}
