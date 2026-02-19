import path from "node:path";
import { fileURLToPath } from "node:url";
import posthog from "@posthog/rollup-plugin";
import type { Alias, Plugin } from "vite";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export function createPosthogPlugin(
  env: Record<string, string>,
): Plugin | null {
  if (!env.POSTHOG_SOURCEMAP_API_KEY || !env.POSTHOG_ENV_ID) {
    return null;
  }
  return posthog({
    personalApiKey: env.POSTHOG_SOURCEMAP_API_KEY,
    envId: env.POSTHOG_ENV_ID,
    host: env.POSTHOG_HOST,
    sourcemaps: {
      team: "twig",
      deleteAfterUpload: true,
    },
  });
}

export function createForceDevModeDefine(): Record<string, string> | undefined {
  if (process.env.FORCE_DEV_MODE !== "1") {
    return undefined;
  }
  return {
    "import.meta.env.DEV": "true",
    "import.meta.env.PROD": "false",
    "import.meta.env.MODE": '"development"',
  };
}

const baseAliases: Alias[] = [
  { find: "@main", replacement: path.resolve(__dirname, "./src/main") },
  { find: "@renderer", replacement: path.resolve(__dirname, "./src/renderer") },
  { find: "@shared", replacement: path.resolve(__dirname, "./src/shared") },
];

const agentAliases: Alias[] = [
  {
    find: /^@posthog\/agent\/(.+)$/,
    replacement: path.resolve(__dirname, "../../packages/agent/src/$1.ts"),
  },
  {
    find: "@posthog/agent",
    replacement: path.resolve(__dirname, "../../packages/agent/src/index.ts"),
  },
];

export const mainAliases: Alias[] = [
  ...baseAliases,
  {
    find: "@posthog/electron-trpc/main",
    replacement: path.resolve(
      __dirname,
      "../../packages/electron-trpc/src/main/index.ts",
    ),
  },
  ...agentAliases,
];

export const rendererAliases: Alias[] = [
  ...baseAliases,
  {
    find: "@features",
    replacement: path.resolve(__dirname, "./src/renderer/features"),
  },
  {
    find: "@components",
    replacement: path.resolve(__dirname, "./src/renderer/components"),
  },
  {
    find: "@stores",
    replacement: path.resolve(__dirname, "./src/renderer/stores"),
  },
  {
    find: "@hooks",
    replacement: path.resolve(__dirname, "./src/renderer/hooks"),
  },
  {
    find: "@utils",
    replacement: path.resolve(__dirname, "./src/renderer/utils"),
  },
  {
    find: "@posthog/electron-trpc/renderer",
    replacement: path.resolve(
      __dirname,
      "../../packages/electron-trpc/src/renderer/index.ts",
    ),
  },
  ...agentAliases,
];
