import path from "node:path";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";
import {
  createForceDevModeDefine,
  createPosthogPlugin,
  rendererAliases,
} from "./vite.shared.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, path.resolve(__dirname, "../.."), "");

  return {
    plugins: [react(), tsconfigPaths(), createPosthogPlugin(env)].filter(
      Boolean,
    ),
    build: {
      sourcemap: true,
    },
    envDir: path.resolve(__dirname, "../.."),
    define: createForceDevModeDefine(),
    resolve: {
      alias: rendererAliases,
    },
  };
});
