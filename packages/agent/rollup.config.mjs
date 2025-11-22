import { builtinModules } from "node:module";
import path from "node:path";
import commonjs from "@rollup/plugin-commonjs";
import { nodeResolve } from "@rollup/plugin-node-resolve";
import { defineConfig } from "rollup";
import copy from "rollup-plugin-copy";
import typescript from "rollup-plugin-typescript2";

const external = [
  ...builtinModules,
  ...builtinModules.map((moduleName) => `node:${moduleName}`),
  "@anthropic-ai/claude-agent-sdk",
  "dotenv",
  "openai",
  "zod",
];

export default defineConfig({
  input: "index.ts",
  output: {
    dir: "dist",
    format: "esm",
    sourcemap: true,
    preserveModules: true,
    preserveModulesRoot: ".",
    entryFileNames: "[name].js",
    chunkFileNames: "[name].js",
  },
  external,
  plugins: [
    nodeResolve({
      extensions: [".ts", ".js", ".json"],
    }),
    commonjs(),
    typescript({
      tsconfig: path.resolve("tsconfig.rollup.json"),
      useTsconfigDeclarationDir: true,
      clean: true,
      tsconfigOverride: {
        compilerOptions: {
          skipLibCheck: true,
        },
      },
    }),
    copy({
      targets: [
        {
          src: "src/templates/*",
          dest: "dist/templates",
        },
        // Bundle Claude CLI so consumers don't need to navigate nested node_modules
        {
          src: "../../node_modules/@anthropic-ai/claude-agent-sdk/cli.js",
          dest: "dist/claude-cli",
        },
        // Create package.json for ES module support
        {
          src: "../../node_modules/@anthropic-ai/claude-agent-sdk/package.json",
          dest: "dist/claude-cli",
          transform: (_contents) => {
            // Only keep "type": "module" from the original package.json
            return JSON.stringify({ type: "module" }, null, 2);
          },
        },
        // Copy yoga.wasm file that Claude CLI needs
        {
          src: "../../node_modules/yoga-wasm-web/dist/yoga.wasm",
          dest: "dist/claude-cli",
        },
      ],
      hook: "buildStart", // Changed hook from writeBundle to buildStart to ensure copy happens early
    }),
  ],
});
