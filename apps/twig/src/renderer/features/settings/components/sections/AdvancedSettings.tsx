import { SettingRow } from "@features/settings/components/SettingRow";
import { Button, Flex } from "@radix-ui/themes";
import { clearApplicationStorage } from "@renderer/lib/clearStorage";

export function AdvancedSettings() {
  return (
    <Flex direction="column">
      <SettingRow
        label="Clear application storage"
        description="This will remove all locally stored application data."
        noBorder
      >
        <Button
          variant="soft"
          color="red"
          size="1"
          onClick={clearApplicationStorage}
        >
          Clear all data
        </Button>
      </SettingRow>
    </Flex>
  );
}
