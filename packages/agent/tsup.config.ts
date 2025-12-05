import {
  copyFileSync,
  cpSync,
  existsSync,
  mkdirSync,
  writeFileSync,
} from "node:fs";
import { builtinModules } from "node:module";
import { resolve } from "node:path";
import { defineConfig } from "tsup";

function copyAssets() {
  const distDir = resolve(import.meta.dirname, "dist");
  const templatesDir = resolve(distDir, "templates");
  const claudeCliDir = resolve(distDir, "claude-cli");

  mkdirSync(templatesDir, { recursive: true });
  mkdirSync(claudeCliDir, { recursive: true });

  const srcTemplatesDir = resolve(import.meta.dirname, "src/templates");
  if (existsSync(srcTemplatesDir)) {
    cpSync(srcTemplatesDir, templatesDir, { recursive: true });
  }

  const claudeSdkPath = resolve(
    import.meta.dirname,
    "../../node_modules/@anthropic-ai/claude-agent-sdk",
  );
  const cliJsPath = resolve(claudeSdkPath, "cli.js");
  if (existsSync(cliJsPath)) {
    copyFileSync(cliJsPath, resolve(claudeCliDir, "cli.js"));
  }

  writeFileSync(
    resolve(claudeCliDir, "package.json"),
    JSON.stringify({ type: "module" }, null, 2),
  );

  const yogaWasmPath = resolve(
    import.meta.dirname,
    "../../node_modules/yoga-wasm-web/dist/yoga.wasm",
  );
  if (existsSync(yogaWasmPath)) {
    copyFileSync(yogaWasmPath, resolve(claudeCliDir, "yoga.wasm"));
  }
}

export default defineConfig({
  entry: ["index.ts"],
  format: ["esm"],
  dts: true,
  sourcemap: true,
  clean: true,
  splitting: false,
  outDir: "dist",
  target: "node20",
  external: [
    ...builtinModules,
    ...builtinModules.map((m) => `node:${m}`),
    "@anthropic-ai/claude-agent-sdk",
    "dotenv",
    "openai",
    "zod",
  ],
  onSuccess: async () => {
    copyAssets();
    console.log("Assets copied successfully");

    // Touch a trigger file to signal electron-forge to restart
    // This file is watched by Vite, triggering main process rebuild
    const triggerFile = resolve(
      import.meta.dirname,
      "../../apps/array/src/main/.agent-trigger",
    );
    writeFileSync(triggerFile, `${Date.now()}`);
  },
});
