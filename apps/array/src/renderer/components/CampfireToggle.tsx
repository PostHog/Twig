import { Campfire } from "@phosphor-icons/react";
import { IconButton, Tooltip } from "@radix-ui/themes";
import { useThemeStore } from "@stores/themeStore";

export function CampfireToggle() {
  const { isDarkMode, toggleDarkMode } = useThemeStore();

  return (
    <Tooltip content={isDarkMode ? "Light mode" : "Dark mode"}>
      <IconButton
        size="1"
        variant="ghost"
        onClick={toggleDarkMode}
        style={{
          color: isDarkMode ? "var(--orange-9)" : "var(--gray-9)",
        }}
      >
        <Campfire size={16} weight={isDarkMode ? "fill" : "regular"} />
      </IconButton>
    </Tooltip>
  );
}
