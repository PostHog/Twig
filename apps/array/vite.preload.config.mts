import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";
import { autoServicesPlugin } from "./vite-plugin-auto-services.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const monorepoRoot = path.resolve(__dirname, "../..");

export default defineConfig({
  envDir: monorepoRoot,
  plugins: [
    tsconfigPaths(),
    autoServicesPlugin(path.join(__dirname, "src/main/services")),
  ],
});
