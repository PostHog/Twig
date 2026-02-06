import { useSettingsDialogStore } from "@features/settings/stores/settingsDialogStore";
import { Gear } from "@phosphor-icons/react";
import { IconButton, Tooltip } from "@radix-ui/themes";

export function SettingsToggle() {
  const isOpen = useSettingsDialogStore((s) => s.isOpen);
  const openSettings = useSettingsDialogStore((s) => s.open);

  return (
    <Tooltip content="Settings">
      <IconButton
        size="1"
        variant="ghost"
        onClick={() => openSettings()}
        style={{
          color: isOpen ? "var(--blue-9)" : "var(--gray-9)",
        }}
      >
        <Gear size={12} weight={isOpen ? "fill" : "regular"} />
      </IconButton>
    </Tooltip>
  );
}
