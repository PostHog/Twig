/// <reference types="vitest" />
import path from "node:path";
import { defineConfig } from "vite";

module.exports = defineConfig({
  test: {
    coverage: {
      all: true,
      include: ["src/**/*"],
      reporter: ["text", "cobertura", "html"],
      reportsDirectory: path.resolve(__dirname, "./coverage/"),
    },
  },
});
