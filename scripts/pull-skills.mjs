#!/usr/bin/env node

/**
 * Downloads remote skills into local-skills/ for local editing/testing.
 *
 * Usage: pnpm pull-skills
 *
 * The downloaded skills land in plugins/claude-code/local-skills/ which is
 * gitignored and overlaid on top of shipped + remote skills by the Vite dev build.
 */

import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { cp, mkdir, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const __dirname = dirname(fileURLToPath(import.meta.url));
const SKILLS_ZIP_URL =
  "https://github.com/PostHog/posthog/releases/download/agent-skills-latest/skills.zip";
const LOCAL_SKILLS_DIR = join(__dirname, "..", "plugins", "claude-code", "local-skills");

const tempDir = join(tmpdir(), `twig-pull-skills-${Date.now()}`);
await mkdir(tempDir, { recursive: true });

try {
  const zipPath = join(tempDir, "skills.zip");

  console.log("Downloading skills.zip...");
  await execFileAsync("curl", ["-fsSL", "-o", zipPath, SKILLS_ZIP_URL], {
    timeout: 30_000,
  });

  const extractDir = join(tempDir, "extracted");
  await mkdir(extractDir, { recursive: true });
  await execFileAsync("unzip", ["-o", zipPath, "-d", extractDir]);

  // Find the skills directory
  let skillsSource = null;
  const direct = join(extractDir, "skills");
  if (existsSync(direct)) {
    skillsSource = direct;
  } else {
    // Check one level deep
    const entries = await readdir(extractDir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory()) {
        const nested = join(extractDir, entry.name, "skills");
        if (existsSync(nested)) {
          skillsSource = nested;
          break;
        }
      }
    }
  }

  if (!skillsSource) {
    // The extracted dir itself might contain skill directories
    const entries = await readdir(extractDir, { withFileTypes: true });
    const hasSkillDirs = entries.some(
      (e) =>
        e.isDirectory() && existsSync(join(extractDir, e.name, "SKILL.md")),
    );
    if (hasSkillDirs) {
      skillsSource = extractDir;
    }
  }

  if (!skillsSource) {
    console.error("No skills directory found in downloaded archive");
    process.exit(1);
  }

  // Copy to local-skills/
  await rm(LOCAL_SKILLS_DIR, { recursive: true, force: true });
  await cp(skillsSource, LOCAL_SKILLS_DIR, { recursive: true });

  console.log(`Skills extracted to ${LOCAL_SKILLS_DIR}`);
  console.log(
    "Edit skills locally — Vite will hot-reload them in dev mode.",
  );
} finally {
  await rm(tempDir, { recursive: true, force: true });
}
