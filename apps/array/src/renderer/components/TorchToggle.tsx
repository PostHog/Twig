import { useSettingsStore } from "@features/settings/stores/settingsStore";
import { Fire } from "@phosphor-icons/react";
import { IconButton, Tooltip } from "@radix-ui/themes";
import { useThemeStore } from "@stores/themeStore";

export function TorchToggle() {
  const isDarkMode = useThemeStore((state) => state.isDarkMode);
  const { cursorGlow, setCursorGlow } = useSettingsStore();

  // Only show torch toggle in dark mode
  if (!isDarkMode) return null;

  return (
    <Tooltip content={cursorGlow ? "Disable torch" : "Enable torch"}>
      <IconButton
        size="1"
        variant="ghost"
        onClick={() => setCursorGlow(!cursorGlow)}
        style={{
          color: cursorGlow ? "var(--orange-9)" : "var(--gray-9)",
        }}
      >
        <Fire size={16} weight={cursorGlow ? "fill" : "regular"} />
      </IconButton>
    </Tooltip>
  );
}
