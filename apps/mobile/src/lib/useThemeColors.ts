import { useColorScheme } from "nativewind";

/**
 * Raw color values for native components (headers, icons, ActivityIndicator).
 * Keep in sync with CSS variables in global.css.
 *
 * For styled components, use Tailwind classes:
 * - bg-gray-1, text-gray-12, border-gray-6
 * - bg-accent-9, text-accent-11
 * - bg-background
 *
 * These classes auto-adapt to light/dark mode via CSS variables.
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
};

export type ThemeColors = (typeof colors)[keyof typeof colors];

/**
 * Hook to get raw color values for native components.
 * For styled components, use Tailwind classes (bg-gray-1, text-accent-9, etc.)
 */
export function useThemeColors(): ThemeColors {
  const { colorScheme } = useColorScheme();
  return colorScheme === "dark" ? colors.dark : colors.light;
}
