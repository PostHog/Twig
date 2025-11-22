import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";
import { autoServicesPlugin } from "./vite-plugin-auto-services.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [
    tsconfigPaths(),
    autoServicesPlugin(path.join(__dirname, "src/main/services")),
  ],
});
