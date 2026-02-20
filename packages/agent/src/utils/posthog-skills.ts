import { execSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { SdkPluginConfig } from "@anthropic-ai/claude-agent-sdk";
import type { Logger } from "./logger.js";

const GITHUB_RELEASE_URL =
  "https://github.com/PostHog/context-mill/releases/latest/download/posthog-all.zip";

const SKILLS_DIR_NAME = "posthog-skills";

// ── Shared resolution ──────────────────────────────────────────────────

/**
 * Resolve the posthog-all skills directory path.
 *
 * Priority:
 * 1. POSTHOG_SKILLS_DIR env var — use as-is (local development)
 * 2. Download from GitHub releases to /tmp/posthog-skills/posthog-all/
 *
 * Returns null if the directory cannot be resolved.
 */
function resolveSkillsDir(logger: Logger): string | null {
  const localDir = process.env.POSTHOG_SKILLS_DIR;
  if (localDir) {
    const skillsSubdir = path.join(localDir, "skills");
    if (fs.existsSync(localDir) && fs.existsSync(skillsSubdir)) {
      logger.info(`PostHog skills: using local dir ${localDir}`);
      return localDir;
    }
    logger.warn(
      `PostHog skills: POSTHOG_SKILLS_DIR="${localDir}" is not a valid plugin directory, skipping`,
    );
    return null;
  }

  return downloadSkillsDir(logger);
}

/**
 * Download the posthog-all plugin ZIP from GitHub releases to /tmp.
 * Uses a simple cache: if the directory already exists, skip download.
 */
function downloadSkillsDir(logger: Logger): string | null {
  const tmpBase = path.join(os.tmpdir(), SKILLS_DIR_NAME);
  const pluginDir = path.join(tmpBase, "posthog-all");
  const marker = path.join(pluginDir, "skills");

  // Already cached
  if (fs.existsSync(marker)) {
    logger.info(`PostHog skills: using cached dir at ${pluginDir}`);
    return pluginDir;
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

    if (!fs.existsSync(marker)) {
      logger.warn(
        "PostHog skills: downloaded archive missing skills/ directory, skipping",
      );
      return null;
    }

    logger.info(`PostHog skills: installed to ${pluginDir}`);
    return pluginDir;
  } catch (err) {
    logger.warn(
      `PostHog skills: failed to download/install: ${err instanceof Error ? err.message : err}`,
    );
    try {
      if (fs.existsSync(zipPath)) fs.unlinkSync(zipPath);
    } catch {
      // best-effort cleanup
    }
    return null;
  }
}

// ── Claude: SDK plugin ─────────────────────────────────────────────────

/**
 * Resolve the posthog-all mega-plugin as a Claude SDK plugin config.
 */
export function resolvePostHogSkillsPlugin(
  logger: Logger,
): SdkPluginConfig | null {
  const dir = resolveSkillsDir(logger);
  if (!dir) return null;

  // Claude needs the .claude-plugin/plugin.json to be present
  if (!fs.existsSync(path.join(dir, ".claude-plugin", "plugin.json"))) {
    logger.warn("PostHog skills: directory missing .claude-plugin/plugin.json");
    return null;
  }

  return { type: "local", path: dir };
}

// ── Codex: symlink into ~/.agents/skills/ ──────────────────────────────

const CODEX_SKILLS_DIR = path.join(os.homedir(), ".agents", "skills");
const POSTHOG_SKILL_PREFIX = "posthog--";

/**
 * Install PostHog skills for Codex by symlinking each skill directory
 * into ~/.agents/skills/. Codex auto-discovers skills in this location.
 *
 * Symlinks are prefixed with "posthog--" to avoid collisions and allow
 * easy cleanup. Existing PostHog symlinks are refreshed on each call.
 *
 * Returns the number of skills installed, or 0 on failure.
 */
export function installPostHogSkillsForCodex(logger: Logger): number {
  const dir = resolveSkillsDir(logger);
  if (!dir) return 0;

  const skillsRoot = path.join(dir, "skills");
  if (!fs.existsSync(skillsRoot)) {
    logger.warn("PostHog skills (Codex): no skills/ directory found");
    return 0;
  }

  try {
    fs.mkdirSync(CODEX_SKILLS_DIR, { recursive: true });

    // Clean stale PostHog symlinks
    for (const entry of fs.readdirSync(CODEX_SKILLS_DIR)) {
      if (entry.startsWith(POSTHOG_SKILL_PREFIX)) {
        const linkPath = path.join(CODEX_SKILLS_DIR, entry);
        try {
          const stat = fs.lstatSync(linkPath);
          if (stat.isSymbolicLink()) {
            fs.unlinkSync(linkPath);
          }
        } catch {
          // best-effort
        }
      }
    }

    // Create fresh symlinks
    const skillDirs = fs
      .readdirSync(skillsRoot, { withFileTypes: true })
      .filter(
        (e) =>
          e.isDirectory() &&
          fs.existsSync(path.join(skillsRoot, e.name, "SKILL.md")),
      );

    for (const entry of skillDirs) {
      const target = path.join(skillsRoot, entry.name);
      const linkName = `${POSTHOG_SKILL_PREFIX}${entry.name}`;
      const linkPath = path.join(CODEX_SKILLS_DIR, linkName);
      fs.symlinkSync(target, linkPath);
    }

    logger.info(
      `PostHog skills (Codex): installed ${skillDirs.length} skills to ${CODEX_SKILLS_DIR}`,
    );
    return skillDirs.length;
  } catch (err) {
    logger.warn(
      `PostHog skills (Codex): failed to install: ${err instanceof Error ? err.message : err}`,
    );
    return 0;
  }
}

// ── Cache management ───────────────────────────────────────────────────

/**
 * Clear the cached skills from /tmp and remove Codex symlinks.
 */
export function clearPostHogSkillsCache(logger: Logger): void {
  // Clear /tmp cache
  const tmpBase = path.join(os.tmpdir(), SKILLS_DIR_NAME);
  try {
    if (fs.existsSync(tmpBase)) {
      fs.rmSync(tmpBase, { recursive: true, force: true });
      logger.info("PostHog skills: cleared /tmp cache");
    }
  } catch {
    // best-effort
  }

  // Remove Codex symlinks
  try {
    if (fs.existsSync(CODEX_SKILLS_DIR)) {
      for (const entry of fs.readdirSync(CODEX_SKILLS_DIR)) {
        if (entry.startsWith(POSTHOG_SKILL_PREFIX)) {
          const linkPath = path.join(CODEX_SKILLS_DIR, entry);
          try {
            if (fs.lstatSync(linkPath).isSymbolicLink()) {
              fs.unlinkSync(linkPath);
            }
          } catch {
            // best-effort
          }
        }
      }
      logger.info("PostHog skills: cleared Codex symlinks");
    }
  } catch {
    // best-effort
  }
}
