import { Campfire } from "@phosphor-icons/react";
import { IconButton, Tooltip } from "@radix-ui/themes";
import { useThemeStore } from "@stores/themeStore";

const TOOLTIP_LABELS = {
  dark: "Switch to light mode",
  light: "Switch to system theme",
  system: "Switch to dark mode",
} as const;

export function CampfireToggle() {
  const { theme, isDarkMode, cycleTheme } = useThemeStore();

  return (
    <Tooltip content={TOOLTIP_LABELS[theme]}>
      <IconButton
        size="1"
        variant="ghost"
        onClick={cycleTheme}
        style={{
          color: isDarkMode ? "var(--orange-9)" : "var(--gray-9)",
        }}
      >
        <Campfire size={12} weight={isDarkMode ? "fill" : "regular"} />
      </IconButton>
    </Tooltip>
  );
}
