#!/usr/bin/env node

/**
 * Downloads remote skills into local-skills/ for local editing/testing.
 *
 * Usage: pnpm pull-skills
 *
 * The downloaded skills land in plugins/posthog/local-skills/ which is
 * gitignored and overlaid on top of shipped + remote skills by the Vite dev build.
 */

import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { cp, mkdir, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const __dirname = dirname(fileURLToPath(import.meta.url));
const SKILLS_ZIP_URL =
  "https://github.com/PostHog/posthog/releases/download/agent-skills-latest/skills.zip";
const CONTEXT_MILL_ZIP_URL =
  "https://github.com/PostHog/context-mill/releases/latest/download/skills-mcp-resources.zip";
const LOCAL_SKILLS_DIR = join(
  __dirname,
  "..",
  "plugins",
  "posthog",
  "local-skills",
);

/** Known topic prefixes in context-mill skill names. Skills sharing a prefix are grouped. */
const CONTEXT_MILL_GROUP_PREFIXES = [
  "feature-flags",
  "integration",
  "logs",
  "tools-and-features",
  "llm-analytics",
];

function generateGroupSkillMd(groupName, variants) {
  const title = groupName
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
  const variantList = variants.map((v) => `- \`${v}\``).join("\n");

  return [
    "---",
    `name: ${groupName}`,
    `description: PostHog ${title.toLowerCase()} guides`,
    "---",
    "",
    `# ${title}`,
    "",
    "Each subdirectory in `references/` contains a framework-specific guide.",
    "",
    "## Available",
    "",
    variantList,
    "",
  ].join("\n");
}

/**
 * Groups extracted context-mill skills by topic prefix.
 * Skills sharing a prefix are merged into a single skill directory.
 */
async function groupAndCopyContextMillSkills(flatDir, destDir) {
  const entries = await readdir(flatDir, { withFileTypes: true });
  const skillNames = entries.filter((e) => e.isDirectory()).map((e) => e.name);

  const groups = new Map();
  const ungrouped = [];

  for (const name of skillNames) {
    const prefix = CONTEXT_MILL_GROUP_PREFIXES.find((p) =>
      name.startsWith(`${p}-`),
    );
    if (prefix) {
      if (!groups.has(prefix)) groups.set(prefix, []);
      groups.get(prefix).push(name);
    } else {
      ungrouped.push(name);
    }
  }

  for (const [prefix, variants] of groups) {
    const groupDir = join(destDir, prefix);
    const refsDir = join(groupDir, "references");
    await mkdir(refsDir, { recursive: true });

    const variantNames = variants
      .map((v) => v.slice(prefix.length + 1))
      .sort();
    await writeFile(
      join(groupDir, "SKILL.md"),
      generateGroupSkillMd(prefix, variantNames),
    );

    for (const name of variants) {
      const variant = name.slice(prefix.length + 1);
      const dest = join(refsDir, variant);
      await rm(dest, { recursive: true, force: true });
      await cp(join(flatDir, name), dest, { recursive: true });
    }
  }

  for (const name of ungrouped) {
    const dest = join(destDir, name);
    await rm(dest, { recursive: true, force: true });
    await cp(join(flatDir, name), dest, { recursive: true });
  }
}

/**
 * Finds the skills directory inside an extracted zip.
 * Handles: skills/ at root, nested (e.g. posthog/skills/), or skill dirs directly at root.
 */
async function findSkillsDir(extractDir) {
  const direct = join(extractDir, "skills");
  if (existsSync(direct)) return direct;

  const entries = await readdir(extractDir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.isDirectory()) {
      const nested = join(extractDir, entry.name, "skills");
      if (existsSync(nested)) return nested;
    }
  }

  const hasSkillDirs = entries.some(
    (e) => e.isDirectory() && existsSync(join(extractDir, e.name, "SKILL.md")),
  );
  if (hasSkillDirs) return extractDir;

  return null;
}

/**
 * Downloads a skills zip from `url`, extracts it, and merges skill directories into `destDir`.
 */
async function downloadAndMerge(url, destDir, label) {
  const tempDir = join(tmpdir(), `twig-pull-${label}-${Date.now()}`);
  await mkdir(tempDir, { recursive: true });

  try {
    const zipPath = join(tempDir, `${label}.zip`);
    console.log(`Downloading ${label} skills...`);
    await execFileAsync("curl", ["-fsSL", "-o", zipPath, url], {
      timeout: 30_000,
    });

    const extractDir = join(tempDir, "extracted");
    await mkdir(extractDir, { recursive: true });
    await execFileAsync("unzip", ["-o", zipPath, "-d", extractDir]);

    const skillsSource = await findSkillsDir(extractDir);
    if (!skillsSource) {
      console.warn(`No skills directory found in ${label} archive`);
      return false;
    }

    await mkdir(destDir, { recursive: true });
    const entries = await readdir(skillsSource, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory()) {
        const dest = join(destDir, entry.name);
        await rm(dest, { recursive: true, force: true });
        await cp(join(skillsSource, entry.name), dest, { recursive: true });
      }
    }

    console.log(`${label} skills merged`);
    return true;
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

/**
 * Downloads context-mill's bundle zip (nested .zip files — one per skill),
 * groups related skills by topic, and extracts into `destDir`.
 */
async function downloadAndMergeContextMill(url, destDir) {
  const tempDir = join(tmpdir(), `twig-pull-context-mill-${Date.now()}`);
  await mkdir(tempDir, { recursive: true });

  try {
    const zipPath = join(tempDir, "context-mill.zip");
    console.log("Downloading context-mill skills...");
    await execFileAsync("curl", ["-fsSL", "-o", zipPath, url], {
      timeout: 60_000,
    });

    const extractDir = join(tempDir, "extracted");
    await mkdir(extractDir, { recursive: true });
    await execFileAsync("unzip", ["-o", zipPath, "-d", extractDir]);

    // Extract each inner zip into a flat staging directory
    const flatDir = join(tempDir, "flat");
    await mkdir(flatDir, { recursive: true });

    const outerEntries = await readdir(extractDir);
    for (const entry of outerEntries) {
      if (!entry.endsWith(".zip")) continue;

      const skillName = entry.replace(/\.zip$/, "");
      const dest = join(flatDir, skillName);
      await mkdir(dest, { recursive: true });
      await execFileAsync("unzip", ["-o", join(extractDir, entry), "-d", dest]);
    }

    // Group related skills by topic prefix, then copy to destDir
    await groupAndCopyContextMillSkills(flatDir, destDir);

    console.log("context-mill skills merged");
    return true;
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

// Merge skills from both sources into local-skills/.
// Context-mill first (base), then posthog skills on top (override for same-named skills).
await rm(LOCAL_SKILLS_DIR, { recursive: true, force: true });
await mkdir(LOCAL_SKILLS_DIR, { recursive: true });

let hasSkills = false;
try {
  if (await downloadAndMergeContextMill(CONTEXT_MILL_ZIP_URL, LOCAL_SKILLS_DIR)) {
    hasSkills = true;
  }
} catch (err) {
  console.warn("Failed to download context-mill skills (non-fatal):", err.message);
}

try {
  if (await downloadAndMerge(SKILLS_ZIP_URL, LOCAL_SKILLS_DIR, "posthog")) {
    hasSkills = true;
  }
} catch (err) {
  console.warn("Failed to download posthog skills (non-fatal):", err.message);
}

if (!hasSkills) {
  console.error("No skills found from any source");
  process.exit(1);
}

console.log(`Skills extracted to ${LOCAL_SKILLS_DIR}`);
console.log("Edit skills locally — Vite will hot-reload them in dev mode.");
