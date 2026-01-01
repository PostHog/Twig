import { useColorScheme, vars } from "nativewind";

/**
 * Single source of truth for all theme colors.
 * Defined as hex for readability, converted to RGB for NativeWind vars().
 */
const colors = {
  light: {
    gray: {
      1: "#eaeaea",
      2: "#e5e5e5",
      3: "#dbdbdb",
      4: "#d2d2d2",
      5: "#cacaca",
      6: "#c1c1c1",
      7: "#b5b5b5",
      8: "#a2a2a2",
      9: "#747474",
      10: "#6a6a6a",
      11: "#4e4e4e",
      12: "#1f1f1f",
    },
    accent: {
      1: "#ecebe9",
      2: "#f1e5d5",
      3: "#fcd9ac",
      4: "#ffcb81",
      5: "#ffbd57",
      6: "#f1b154",
      7: "#de9f41",
      8: "#ce8500",
      9: "#dc9300",
      10: "#d08800",
      11: "#8a5400",
      12: "#4d3616",
      contrast: "#ffffff",
    },
    status: {
      success: "#22c55e",
      error: "#ef4444",
      warning: "#f59e0b",
      info: "#3b82f6",
    },
    background: "#eeefe9",
  },
  dark: {
    gray: {
      1: "#151515",
      2: "#1c1c1c",
      3: "#242424",
      4: "#2b2b28",
      5: "#323231",
      6: "#3b3b38",
      7: "#484846",
      8: "#60605c",
      9: "#6e6e6b",
      10: "#7b7b7b",
      11: "#b4b4b1",
      12: "#eeeeea",
    },
    accent: {
      1: "#181410",
      2: "#1e1911",
      3: "#2e210e",
      4: "#3f2700",
      5: "#4c3101",
      6: "#5a3e13",
      7: "#6e5022",
      8: "#8d662d",
      9: "#f1a82c",
      10: "#e69d18",
      11: "#f9b858",
      12: "#fbe3c4",
      contrast: "#2d1f0a",
    },
    status: {
      success: "#4ade80",
      error: "#f87171",
      warning: "#fbbf24",
      info: "#60a5fa",
    },
    background: "#151515",
  },
} as const;

// Convert hex to RGB space-separated format for NativeWind vars()
function hexToRgb(hex: string): string {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!result) return "0 0 0";
  return `${parseInt(result[1], 16)} ${parseInt(result[2], 16)} ${parseInt(result[3], 16)}`;
}

// Generate NativeWind vars() from color definitions
function createThemeVars(theme: (typeof colors)["light" | "dark"]) {
  return vars({
    "--gray-1": hexToRgb(theme.gray[1]),
    "--gray-2": hexToRgb(theme.gray[2]),
    "--gray-3": hexToRgb(theme.gray[3]),
    "--gray-4": hexToRgb(theme.gray[4]),
    "--gray-5": hexToRgb(theme.gray[5]),
    "--gray-6": hexToRgb(theme.gray[6]),
    "--gray-7": hexToRgb(theme.gray[7]),
    "--gray-8": hexToRgb(theme.gray[8]),
    "--gray-9": hexToRgb(theme.gray[9]),
    "--gray-10": hexToRgb(theme.gray[10]),
    "--gray-11": hexToRgb(theme.gray[11]),
    "--gray-12": hexToRgb(theme.gray[12]),
    "--accent-1": hexToRgb(theme.accent[1]),
    "--accent-2": hexToRgb(theme.accent[2]),
    "--accent-3": hexToRgb(theme.accent[3]),
    "--accent-4": hexToRgb(theme.accent[4]),
    "--accent-5": hexToRgb(theme.accent[5]),
    "--accent-6": hexToRgb(theme.accent[6]),
    "--accent-7": hexToRgb(theme.accent[7]),
    "--accent-8": hexToRgb(theme.accent[8]),
    "--accent-9": hexToRgb(theme.accent[9]),
    "--accent-10": hexToRgb(theme.accent[10]),
    "--accent-11": hexToRgb(theme.accent[11]),
    "--accent-12": hexToRgb(theme.accent[12]),
    "--accent-contrast": hexToRgb(theme.accent.contrast),
    "--status-success": hexToRgb(theme.status.success),
    "--status-error": hexToRgb(theme.status.error),
    "--status-warning": hexToRgb(theme.status.warning),
    "--status-info": hexToRgb(theme.status.info),
    "--background": hexToRgb(theme.background),
  });
}

// NativeWind vars() for runtime theming (used in root View style)
export const lightTheme = createThemeVars(colors.light);
export const darkTheme = createThemeVars(colors.dark);

// Types
export type ThemeColors = (typeof colors)["light" | "dark"];

/**
 * Hook to get raw hex color values for native components.
 * Use for: ActivityIndicator, headerStyle, headerTintColor, RefreshControl, etc.
 *
 * For styled components, use Tailwind classes:
 * - bg-gray-1, text-gray-12, border-gray-6
 * - bg-accent-9, text-accent-11
 * - bg-background
 */
export function useThemeColors(): ThemeColors {
  const { colorScheme } = useColorScheme();
  return colorScheme === "dark" ? colors.dark : colors.light;
}
