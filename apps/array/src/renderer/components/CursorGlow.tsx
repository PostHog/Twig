import { useSettingsStore } from "@features/settings/stores/settingsStore";
import { useThemeStore } from "@stores/themeStore";
import { useEffect, useRef, useState } from "react";

export function CursorGlow() {
  const isDarkMode = useThemeStore((state) => state.isDarkMode);
  const cursorGlow = useSettingsStore((state) => state.cursorGlow);
  const [mousePos, setMousePos] = useState<{ x: number; y: number } | null>(
    null,
  );
  const [flicker, setFlicker] = useState({ scale: 1, opacity: 0.6 });
  const animationRef = useRef<number | null>(null);
  const lastUpdateRef = useRef(0);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      setMousePos({ x: e.clientX, y: e.clientY });
    };

    window.addEventListener("mousemove", handleMouseMove);
    return () => window.removeEventListener("mousemove", handleMouseMove);
  }, []);

  // Torch flicker animation - slow breathing with subtle opacity flicker
  useEffect(() => {
    if (!isDarkMode || !cursorGlow) return;

    const animate = (timestamp: number) => {
      // Slow breathing for size (4 second cycle)
      const breathCycle = (timestamp / 4000) * Math.PI * 2;
      const breath = Math.sin(breathCycle);

      // Faster subtle opacity flicker (update every ~150ms)
      if (timestamp - lastUpdateRef.current > 150) {
        lastUpdateRef.current = timestamp;
      }
      const flickerAmount = 0.75 + Math.random() * 0.25; // 0.75 to 1.0

      setFlicker({
        scale: 1 + breath * 0.02,
        opacity: flickerAmount,
      });
      animationRef.current = requestAnimationFrame(animate);
    };

    animationRef.current = requestAnimationFrame(animate);

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [isDarkMode, cursorGlow]);

  if (!isDarkMode || !cursorGlow || !mousePos) return null;

  const baseSize = 200;
  const size = baseSize * flicker.scale;
  const offset = size / 2;

  return (
    <div
      style={{
        position: "fixed",
        left: mousePos.x - offset,
        top: mousePos.y - offset,
        width: size,
        height: size,
        pointerEvents: "none",
        background:
          "radial-gradient(circle at center, var(--fire-glow) 0%, transparent 70%)",
        opacity: flicker.opacity,
        zIndex: 9999,
        transition: "opacity 0.1s ease-out, width 0.1s ease-out, height 0.1s ease-out",
      }}
    />
  );
}
