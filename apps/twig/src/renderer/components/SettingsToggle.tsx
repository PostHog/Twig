import { Gear } from "@phosphor-icons/react";
import { IconButton, Tooltip } from "@radix-ui/themes";
import { useNavigationStore } from "@stores/navigationStore";

export function SettingsToggle() {
  const view = useNavigationStore((s) => s.view);
  const toggleSettings = useNavigationStore((s) => s.toggleSettings);
  const isSettingsOpen = view.type === "settings";

  return (
    <Tooltip content="Settings">
      <IconButton
        size="1"
        variant="ghost"
        onClick={toggleSettings}
        style={{
          color: isSettingsOpen ? "var(--blue-9)" : "var(--gray-9)",
        }}
      >
        <Gear size={16} weight={isSettingsOpen ? "fill" : "regular"} />
      </IconButton>
    </Tooltip>
  );
}
