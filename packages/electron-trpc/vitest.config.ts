/// <reference types="vitest" />
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  test: {
    coverage: {
      all: true,
      include: ["src/**/*"],
      reporter: ["text", "cobertura", "html"],
      reportsDirectory: path.resolve(__dirname, "./coverage/"),
    },
  },
});
