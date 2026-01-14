import { Theme } from "@radix-ui/themes";
import { useThemeStore } from "@stores/themeStore";
import type React from "react";
import { useEffect, useRef } from "react";

let portalContainer: HTMLDivElement | null = null;

export function getPortalContainer(): HTMLElement {
  return portalContainer ?? document.body;
}

export function ThemeWrapper({ children }: { children: React.ReactNode }) {
  const isDarkMode = useThemeStore((state) => state.isDarkMode);
  const portalRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    portalContainer = portalRef.current;
    return () => {
      portalContainer = null;
    };
  }, []);

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
      <div ref={portalRef} id="portal-container" />
    </Theme>
  );
}
