import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import path, { join } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, type Plugin } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Custom Vite plugin to fix circular __filename references in bundled ESM packages.
 *
 * When Vite bundles ESM packages like @posthog/agent that use import.meta.url,
 * it transforms them into a complex polyfill that creates circular references:
 * `const __filename2 = fileURLToPath(... pathToFileURL(__filename2) ...)`
 *
 * This plugin post-processes the bundle to replace the circular reference with
 * a simple assignment to Node.js's global __filename variable.
 */
function fixFilenameCircularRef(): Plugin {
  return {
    name: "fix-filename-circular-ref",
    enforce: "post",
    generateBundle(_options, bundle) {
      for (const fileName in bundle) {
        const chunk = bundle[fileName];
        if (chunk.type === "chunk") {
          // Replace circular __filename references with direct __filename usage
          chunk.code = chunk.code.replace(
            /const __filename(\d+) = url\.fileURLToPath\(typeof document === "undefined" \? require\("url"\)\.pathToFileURL\(__filename\1\)\.href : [^;]+\);/g,
            "const __filename$1 = __filename;",
          );
        }
      }
    },
  };
}

/**
 * Copy agent templates to the build directory
 */
function copyAgentTemplates(): Plugin {
  return {
    name: "copy-agent-templates",
    writeBundle() {
      const templateSrc = join(
        __dirname,
        "node_modules/@posthog/agent/dist/templates/plan-template.md",
      );
      const templateDest = join(
        __dirname,
        ".vite/build/templates/plan-template.md",
      );

      mkdirSync(join(__dirname, ".vite/build/templates"), { recursive: true });
      copyFileSync(templateSrc, templateDest);
      console.log("Copied agent templates to build directory");
    },
  };
}

/**
 * Copy Claude executable to the build directory
 */
function copyClaudeExecutable(): Plugin {
  return {
    name: "copy-claude-executable",
    writeBundle() {
      const sdkDir = join(
        __dirname,
        "node_modules/@posthog/agent/dist/claude-cli/",
      );

      // IMPORTANT: Copy to claude-cli/ subdirectory to isolate the package.json
      // If we put package.json in .vite/build/, it breaks Vite's CommonJS output
      const destDir = join(__dirname, ".vite/build/claude-cli");
      
      if (!existsSync(destDir)) {
        mkdirSync(destDir, { recursive: true });
      }

      const files = ["cli.js", "package.json", "yoga.wasm"];

      for (const file of files) {
        const src = join(sdkDir, file);
        const dest = join(destDir, file);
        
        if (!existsSync(src)) {
          console.warn(
            `[copy-claude-executable] ${file} not found. ` +
            `Run 'pnpm build' in the agent directory first.`
          );
          continue;
        }
        
        copyFileSync(src, dest);
      }

      console.log("Copied Claude CLI to claude-cli/ subdirectory");
    },
  };
}

export default defineConfig({
  plugins: [
    tsconfigPaths(),
    fixFilenameCircularRef(),
    copyAgentTemplates(),
    copyClaudeExecutable(),
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "@main": path.resolve(__dirname, "./src/main"),
      "@renderer": path.resolve(__dirname, "./src/renderer"),
      "@shared": path.resolve(__dirname, "./src/shared"),
      "@api": path.resolve(__dirname, "./src/api"),
    },
  },
  build: {
    target: "node18",
    minify: false, // Disable minification to prevent variable name conflicts
    commonjsOptions: {
      transformMixedEsModules: true,
    },
    rollupOptions: {
      external: ["node-pty"],
    },
  },
});
