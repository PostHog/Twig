import { useSettingsStore } from "@features/settings/stores/settingsStore";
import { useThemeStore } from "@stores/themeStore";
import { useEffect, useState } from "react";

export function CursorGlow() {
  const isDarkMode = useThemeStore((state) => state.isDarkMode);
  const cursorGlow = useSettingsStore((state) => state.cursorGlow);
  const [mousePos, setMousePos] = useState<{ x: number; y: number } | null>(
    null,
  );

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      setMousePos({ x: e.clientX, y: e.clientY });
    };

    window.addEventListener("mousemove", handleMouseMove);
    return () => window.removeEventListener("mousemove", handleMouseMove);
  }, []);

  if (!isDarkMode || !cursorGlow || !mousePos) return null;

  return (
    <div
      style={{
        position: "fixed",
        left: mousePos.x - 100,
        top: mousePos.y - 100,
        width: 200,
        height: 200,
        pointerEvents: "none",
        background:
          "radial-gradient(circle at center, var(--fire-glow) 0%, transparent 70%)",
        zIndex: 9999,
      }}
    />
  );
}
