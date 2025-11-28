import { Theme } from "@radix-ui/themes";
import { useThemeStore } from "@stores/themeStore";
import type React from "react";

export function ThemeWrapper({ children }: { children: React.ReactNode }) {
  const isDarkMode = useThemeStore((state) => state.isDarkMode);

  return (
    <Theme
      appearance={isDarkMode ? "dark" : "light"}
      accentColor={isDarkMode ? "orange" : "yellow"}
      grayColor="slate"
      panelBackground="solid"
      radius="none"
      scaling="100%"
    >
      {children}
    </Theme>
  );
}
