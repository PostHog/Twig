import { execSync } from "node:child_process";
import { copyFileSync, cpSync, existsSync, mkdirSync } from "node:fs";
import path, { join } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, loadEnv, type Plugin } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";
import {
  createForceDevModeDefine,
  createPosthogPlugin,
  mainAliases,
} from "./vite.shared.mjs";
import { autoServicesPlugin } from "./vite-plugin-auto-services.js";

function getGitCommit(): string {
  try {
    return execSync("git rev-parse --short HEAD", { encoding: "utf-8" }).trim();
  } catch {
    return "unknown";
  }
}

function getBuildDate(): string {
  return new Date().toISOString();
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function fixFilenameCircularRef(): Plugin {
  return {
    name: "fix-filename-circular-ref",
    enforce: "post",
    generateBundle(_options, bundle) {
      for (const fileName in bundle) {
        const chunk = bundle[fileName];
        if (chunk.type === "chunk") {
          chunk.code = chunk.code.replace(
            /const __filename(\d+) = [\w$]+\.fileURLToPath\(typeof document === "undefined" \? require\("url"\)\.pathToFileURL\(__filename\1\)\.href : [^;]+\);/g,
            "const __filename$1 = __filename;",
          );
        }
      }
    },
  };
}

function copyClaudeExecutable(): Plugin {
  return {
    name: "copy-claude-executable",
    writeBundle() {
      const destDir = join(__dirname, ".vite/build/claude-cli");

      if (!existsSync(destDir)) {
        mkdirSync(destDir, { recursive: true });
      }

      const candidates = [
        {
          path: join(__dirname, "node_modules/@posthog/agent/dist/claude-cli"),
          type: "package",
        },
        {
          path: join(
            __dirname,
            "../../node_modules/@posthog/agent/dist/claude-cli",
          ),
          type: "package",
        },
        {
          path: join(__dirname, "../../packages/agent/dist/claude-cli"),
          type: "package",
        },
      ];

      for (const candidate of candidates) {
        if (
          existsSync(join(candidate.path, "cli.js")) &&
          existsSync(join(candidate.path, "yoga.wasm"))
        ) {
          const files = ["cli.js", "package.json", "yoga.wasm"];
          for (const file of files) {
            copyFileSync(join(candidate.path, file), join(destDir, file));
          }
          const vendorDir = join(candidate.path, "vendor");
          if (existsSync(vendorDir)) {
            cpSync(vendorDir, join(destDir, "vendor"), { recursive: true });
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
        );
        copyFileSync(join(yogaDir, "yoga.wasm"), join(destDir, "yoga.wasm"));
        const vendorDir = join(sdkDir, "vendor");
        if (existsSync(vendorDir)) {
          cpSync(vendorDir, join(destDir, "vendor"), { recursive: true });
        }
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

function copyCodexAcpBinary(): Plugin {
  return {
    name: "copy-codex-acp-binary",
    writeBundle() {
      const destDir = join(__dirname, ".vite/build/codex-acp");

      if (!existsSync(destDir)) {
        mkdirSync(destDir, { recursive: true });
      }

      const binaryName =
        process.platform === "win32" ? "codex-acp.exe" : "codex-acp";
      const sourceDir = join(__dirname, "resources/codex-acp");
      const sourcePath = join(sourceDir, binaryName);

      if (existsSync(sourcePath)) {
        const destPath = join(destDir, binaryName);
        copyFileSync(sourcePath, destPath);
        console.log(`Copied codex-acp binary to ${destDir}`);

        if (process.platform === "darwin") {
          try {
            execSync(`xattr -cr "${destPath}"`, { stdio: "inherit" });
            execSync(`codesign --force --sign - "${destPath}"`, {
              stdio: "inherit",
            });
            console.log("Ad-hoc signed codex-acp binary");
          } catch (err) {
            console.warn("Failed to sign codex-acp binary:", err);
          }
        }
      } else {
        console.warn(
          `[copy-codex-acp-binary] Binary not found at ${sourcePath}. Run 'node scripts/download-codex-acp.mjs' first.`,
        );
      }
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, path.resolve(__dirname, "../.."), "");

  return {
    plugins: [
      tsconfigPaths(),
      autoServicesPlugin(join(__dirname, "src/main/services")),
      fixFilenameCircularRef(),
      copyClaudeExecutable(),
      copyCodexAcpBinary(),
      createPosthogPlugin(env),
    ].filter(Boolean),
    define: {
      __BUILD_COMMIT__: JSON.stringify(getGitCommit()),
      __BUILD_DATE__: JSON.stringify(getBuildDate()),
      "process.env.VITE_POSTHOG_API_KEY": JSON.stringify(
        env.VITE_POSTHOG_API_KEY || "",
      ),
      "process.env.VITE_POSTHOG_API_HOST": JSON.stringify(
        env.VITE_POSTHOG_API_HOST || "",
      ),
      ...createForceDevModeDefine(),
    },
    resolve: {
      alias: mainAliases,
    },
    cacheDir: ".vite/cache",
    build: {
      target: "node18",
      sourcemap: true,
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
