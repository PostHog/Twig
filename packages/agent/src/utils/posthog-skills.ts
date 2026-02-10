import { execSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { SdkPluginConfig } from "@anthropic-ai/claude-agent-sdk";
import type { Logger } from "./logger.js";

const GITHUB_RELEASE_URL =
  "https://github.com/PostHog/context-mill/releases/latest/download/posthog-all.zip";

const SKILLS_DIR_NAME = "posthog-skills";

/**
 * Resolve the posthog-all mega-plugin as an SDK plugin config.
 *
 * Priority:
 * 1. POSTHOG_SKILLS_DIR env var — use as-is (local development)
 * 2. Download from GitHub releases to /tmp/posthog-skills/
 *
 * Returns null if the plugin cannot be resolved (download fails, etc.)
 */
export function resolvePostHogSkillsPlugin(
  logger: Logger,
): SdkPluginConfig | null {
  const localDir = process.env.POSTHOG_SKILLS_DIR;
  if (localDir) {
    if (
      fs.existsSync(localDir) &&
      fs.existsSync(path.join(localDir, ".claude-plugin", "plugin.json"))
    ) {
      logger.info(`PostHog skills: using local dir ${localDir}`);
      return { type: "local", path: localDir };
    }
    logger.warn(
      `PostHog skills: POSTHOG_SKILLS_DIR="${localDir}" does not contain a valid plugin, skipping`,
    );
    return null;
  }

  return downloadSkillsPlugin(logger);
}

/**
 * Download the posthog-all plugin ZIP from GitHub releases to /tmp.
 * Uses a simple cache: if the directory already exists, skip download.
 */
function downloadSkillsPlugin(logger: Logger): SdkPluginConfig | null {
  const tmpBase = path.join(os.tmpdir(), SKILLS_DIR_NAME);
  const pluginDir = path.join(tmpBase, "posthog-all");
  const pluginJson = path.join(pluginDir, ".claude-plugin", "plugin.json");

  // Already cached
  if (fs.existsSync(pluginJson)) {
    logger.info(`PostHog skills: using cached plugin at ${pluginDir}`);
    return { type: "local", path: pluginDir };
  }

  const zipPath = path.join(tmpBase, "posthog-all.zip");

  try {
    fs.mkdirSync(tmpBase, { recursive: true });

    logger.info(`PostHog skills: downloading from ${GITHUB_RELEASE_URL}`);
    execSync(`curl -sL '${GITHUB_RELEASE_URL}' -o '${zipPath}'`, {
      timeout: 30_000,
    });

    if (!fs.existsSync(zipPath) || fs.statSync(zipPath).size === 0) {
      logger.warn("PostHog skills: download produced empty file, skipping");
      return null;
    }

    fs.mkdirSync(pluginDir, { recursive: true });
    execSync(`unzip -o '${zipPath}' -d '${pluginDir}'`, { timeout: 15_000 });
    fs.unlinkSync(zipPath);

    if (!fs.existsSync(pluginJson)) {
      logger.warn(
        "PostHog skills: downloaded archive missing .claude-plugin/plugin.json, skipping",
      );
      return null;
    }

    logger.info(`PostHog skills: installed to ${pluginDir}`);
    return { type: "local", path: pluginDir };
  } catch (err) {
    logger.warn(
      `PostHog skills: failed to download/install: ${err instanceof Error ? err.message : err}`,
    );
    // Clean up partial download
    try {
      if (fs.existsSync(zipPath)) fs.unlinkSync(zipPath);
    } catch {
      // best-effort cleanup
    }
    return null;
  }
}

/**
 * Clear the cached skills plugin from /tmp.
 * Call this to force a re-download on next resolve.
 */
export function clearPostHogSkillsCache(logger: Logger): void {
  const tmpBase = path.join(os.tmpdir(), SKILLS_DIR_NAME);
  try {
    if (fs.existsSync(tmpBase)) {
      fs.rmSync(tmpBase, { recursive: true, force: true });
      logger.info("PostHog skills: cleared cache");
    }
  } catch {
    // best-effort
  }
}
