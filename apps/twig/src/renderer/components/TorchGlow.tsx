import { useSettingsStore } from "@features/settings/stores/settingsStore";
import { useThemeStore } from "@stores/themeStore";
import { useEffect, useState } from "react";

interface TorchGlowProps {
  containerRef: React.RefObject<HTMLElement | null>;
  alwaysShow?: boolean;
}

export function TorchGlow({
  containerRef,
  alwaysShow = false,
}: TorchGlowProps) {
  const isDarkMode = useThemeStore((state) => state.isDarkMode);
  const cursorGlow = useSettingsStore((state) => state.cursorGlow);
  const [mousePos, setMousePos] = useState<{ x: number; y: number } | null>(
    null,
  );
  const [isHovering, setIsHovering] = useState(false);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleMouseMove = (e: MouseEvent) => {
      const rect = container.getBoundingClientRect();
      setMousePos({
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
      });
    };

    const handleMouseEnter = () => setIsHovering(true);
    const handleMouseLeave = () => {
      setIsHovering(false);
      setMousePos(null);
    };

    container.addEventListener("mousemove", handleMouseMove);
    container.addEventListener("mouseenter", handleMouseEnter);
    container.addEventListener("mouseleave", handleMouseLeave);

    return () => {
      container.removeEventListener("mousemove", handleMouseMove);
      container.removeEventListener("mouseenter", handleMouseEnter);
      container.removeEventListener("mouseleave", handleMouseLeave);
    };
  }, [containerRef]);

  // Only show in dark mode when hovering and cursor glow is enabled (unless alwaysShow)
  const shouldShow = alwaysShow || (isDarkMode && cursorGlow);
  if (!shouldShow || !isHovering || !mousePos) return null;

  return (
    <>
      {/* SVG filter for grainy torch light texture */}
      <svg
        aria-hidden="true"
        style={{
          position: "absolute",
          width: 0,
          height: 0,
          overflow: "hidden",
        }}
      >
        <defs>
          <filter id="torch-grain" x="-50%" y="-50%" width="200%" height="200%">
            <feTurbulence
              type="fractalNoise"
              baseFrequency="2.5"
              numOctaves="4"
              result="noise"
            />
            <feColorMatrix
              type="matrix"
              values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 0.6 0"
              result="alphaNoise"
            />
            <feComposite in="SourceGraphic" in2="alphaNoise" operator="in" />
          </filter>
        </defs>
      </svg>

      {/* Base layer - outer glow */}
      <div
        style={{
          position: "absolute",
          left: mousePos.x - 75,
          top: mousePos.y - 80,
          width: 150,
          height: 160,
          pointerEvents: "none",
          background:
            "radial-gradient(ellipse 60% 70% at 50% 55%, rgba(255,120,50,0.58) 0%, transparent 70%)",
          filter: "url(#torch-grain)",
          zIndex: 1,
        }}
      />

      {/* Middle layer - offset for irregular shape */}
      <div
        style={{
          position: "absolute",
          left: mousePos.x - 65,
          top: mousePos.y - 70,
          width: 140,
          height: 130,
          pointerEvents: "none",
          background:
            "radial-gradient(ellipse 70% 55% at 45% 50%, rgba(255,100,40,0.42) 0%, transparent 65%)",
          filter: "url(#torch-grain)",
          zIndex: 1,
        }}
      />

      {/* Inner layer - pulsing flame core */}
      <div
        className="torch-glow-pulse"
        style={{
          position: "absolute",
          left: mousePos.x - 45,
          top: mousePos.y - 55,
          width: 90,
          height: 100,
          pointerEvents: "none",
          background:
            "radial-gradient(ellipse 50% 60% at 50% 45%, rgba(255,180,80,0.48) 0%, transparent 70%)",
          filter: "url(#torch-grain)",
          zIndex: 1,
        }}
      />
    </>
  );
}
