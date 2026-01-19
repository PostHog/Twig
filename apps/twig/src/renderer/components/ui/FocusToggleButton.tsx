import { Flex, Radio, Switch, Text } from "@radix-ui/themes";

interface FocusToggleButtonProps {
  isFocused: boolean;
  onToggle: () => void;
  /** Use radio instead of switch (for git mode where only one can be selected) */
  isRadio?: boolean;
}

export function FocusToggleButton({
  isFocused,
  onToggle,
  isRadio = false,
}: FocusToggleButtonProps) {
  return (
    <Flex
      align="center"
      gap="2"
      onClick={(e) => {
        e.stopPropagation();
        onToggle();
      }}
      style={{ cursor: "pointer" }}
    >
      {isRadio ? (
        <Radio size="1" value="focus" checked={isFocused} />
      ) : (
        <Switch size="1" checked={isFocused} />
      )}
      <Text size="1" color="gray">
        {isFocused ? "Foreground" : "Background"}
      </Text>
    </Flex>
  );
}
