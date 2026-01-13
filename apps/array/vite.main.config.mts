import { execSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import path, { join } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, loadEnv, type Plugin } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";
import { autoServicesPlugin } from "./vite-plugin-auto-services.js";

function _getGitCommit(): string {
  try {
    return execSync("git rev-parse --short HEAD", { encoding: "utf-8" }).trim();
  } catch {
    return "unknown";
  }
}

function _getBuildDate(): string {
  return new Date().toISOString();
}

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
            /const __filename(\d+) = [\w$]+\.fileURLToPath\(typeof document === "undefined" \? require\("url"\)\.pathToFileURL\(__filename\1\)\.href : [^;]+\);/g,
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
      const destDir = join(__dirname, ".vite/build/claude-cli");

      if (!existsSync(destDir)) {
        mkdirSync(destDir, { recursive: true });
      }

      // Define potential sources for the Claude CLI artifacts
      // Priority 1: Pre-built agent package (Production / CI)
      // Priority 2: Workspace source files (Development)
      const candidates = [
        // Local node_modules (standard package structure)
        {
          path: join(__dirname, "node_modules/@posthog/agent/dist/claude-cli"),
          type: "package",
        },
        // Root node_modules (hoisted package)
        {
          path: join(
            __dirname,
            "../../node_modules/@posthog/agent/dist/claude-cli",
          ),
          type: "package",
        },
        // Direct workspace access (monorepo build)
        {
          path: join(__dirname, "../../packages/agent/dist/claude-cli"),
          type: "package",
        },
      ];

      // Check if any pre-built candidate exists
      for (const candidate of candidates) {
        if (
          existsSync(join(candidate.path, "cli.js")) &&
          existsSync(join(candidate.path, "yoga.wasm"))
        ) {
          const files = ["cli.js", "package.json", "yoga.wasm"];
          for (const file of files) {
            copyFileSync(join(candidate.path, file), join(destDir, file));
          }
          return;
        }
      }

      const rootNodeModules = join(__dirname, "../../node_modules");
      const sdkDir = join(rootNodeModules, "@anthropic-ai/claude-agent-sdk");
      const yogaDir = join(rootNodeModules, "yoga-wasm-web/dist");

      if (
        existsSync(join(sdkDir, "cli.js")) &&
        existsSync(join(yogaDir, "yoga.wasm"))
      ) {
        copyFileSync(join(sdkDir, "cli.js"), join(destDir, "cli.js"));
        copyFileSync(
          join(sdkDir, "package.json"),
          join(destDir, "package.json"),
        ); // Note: This copies the SDK package.json, which might not be ideal but works for type: module
        copyFileSync(join(yogaDir, "yoga.wasm"), join(destDir, "yoga.wasm"));
        console.log(
          "Assembled Claude CLI from workspace sources in claude-cli/ subdirectory",
        );
        return;
      }

      console.warn(
        "[copy-claude-executable] FAILED to find Claude CLI artifacts. Agent execution may fail.",
      );
      console.warn("Checked paths:", candidates.map((c) => c.path).join(", "));
      console.warn("Checked workspace sources:", sdkDir);
    },
  };
}

// Allow forcing dev mode in packaged builds via FORCE_DEV_MODE=1
const forceDevMode = process.env.FORCE_DEV_MODE === "1";

export default defineConfig(({ mode }) => {
  // Load VITE_* env vars from monorepo root .env file
  const env = loadEnv(mode, path.resolve(__dirname, "../.."), "VITE_");

  return {
    plugins: [
      tsconfigPaths(),
      autoServicesPlugin(join(__dirname, "src/main/services")),
      fixFilenameCircularRef(),
      copyAgentTemplates(),
      copyClaudeExecutable(),
    ],
    define: {
      __BUILD_COMMIT__: JSON.stringify(_getGitCommit()),
      __BUILD_DATE__: JSON.stringify(_getBuildDate()),
      // Inject PostHog env vars at build time (process.env is not available in packaged builds)
      "process.env.VITE_POSTHOG_API_KEY": JSON.stringify(
        env.VITE_POSTHOG_API_KEY || "",
      ),
      "process.env.VITE_POSTHOG_API_HOST": JSON.stringify(
        env.VITE_POSTHOG_API_HOST || "",
      ),
      ...(forceDevMode
        ? {
            "import.meta.env.DEV": "true",
            "import.meta.env.PROD": "false",
            "import.meta.env.MODE": '"development"',
          }
        : {}),
    },
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
        "@main": path.resolve(__dirname, "./src/main"),
        "@renderer": path.resolve(__dirname, "./src/renderer"),
        "@shared": path.resolve(__dirname, "./src/shared"),
        "@api": path.resolve(__dirname, "./src/api"),
      },
    },
    cacheDir: ".vite/cache",
    build: {
      target: "node18",
      minify: false,
      reportCompressedSize: false,
      commonjsOptions: {
        transformMixedEsModules: true,
      },
      rollupOptions: {
        external: ["node-pty", "@parcel/watcher", "file-icon"],
        onwarn(warning, warn) {
          if (warning.code === "UNUSED_EXTERNAL_IMPORT") return;
          warn(warning);
        },
      },
    },
  };
});
