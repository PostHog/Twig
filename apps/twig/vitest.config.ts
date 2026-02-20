import path from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: ["./src/shared/test/setup.ts"],
    exclude: ["**/node_modules/**", "**/dist/**", "tests/e2e/**"],
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
      exclude: [
        "node_modules/",
        "src/shared/test/",
        "**/*.d.ts",
        "**/*.config.*",
        "**/mockData.ts",
      ],
    },
  },
  resolve: {
    alias: {
      "@main": path.resolve(__dirname, "./src/main"),
      "@renderer": path.resolve(__dirname, "./src/renderer"),
      "@shared": path.resolve(__dirname, "./src/shared"),
      "@features": path.resolve(__dirname, "./src/renderer/features"),
      "@components": path.resolve(__dirname, "./src/renderer/components"),
      "@stores": path.resolve(__dirname, "./src/renderer/stores"),
      "@hooks": path.resolve(__dirname, "./src/renderer/hooks"),
      "@utils": path.resolve(__dirname, "./src/renderer/utils"),
      "@test": path.resolve(__dirname, "./src/shared/test"),
    },
  },
});
