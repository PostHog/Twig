import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { cp, mkdir, readdir, rename, rm, writeFile } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { app, net } from "electron";
import { injectable, postConstruct, preDestroy } from "inversify";
import { logger } from "../../lib/logger.js";
import { TypedEventEmitter } from "../../lib/typed-event-emitter.js";

const log = logger.scope("posthog-plugin");

const execFileAsync = promisify(execFile);
const SKILLS_ZIP_URL = process.env.SKILLS_ZIP_URL!;
const UPDATE_INTERVAL_MS = 30 * 60 * 1000; // 30 minutes
const CODEX_SKILLS_DIR = join(homedir(), ".agents", "skills");

interface SkillsEvents {
  updated: boolean;
}

@injectable()
export class PosthogPluginService extends TypedEventEmitter<SkillsEvents> {
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private lastCheckAt = 0;
  private updating = false;

  /** Runtime plugin dir under userData */
  private get runtimePluginDir(): string {
    return join(app.getPath("userData"), "claude-code-plugin", "posthog");
  }

  /** Runtime skills cache (downloaded zips extracted here) */
  private get runtimeSkillsDir(): string {
    return join(app.getPath("userData"), "skills");
  }

  /** Bundled plugin path inside the .vite build output */
  private get bundledPluginDir(): string {
    const appPath = app.getAppPath();
    return app.isPackaged
      ? join(`${appPath}.unpacked`, ".vite/build/claude-code/posthog")
      : join(appPath, ".vite/build/claude-code/posthog");
  }

  @postConstruct()
  init(): void {
    this.initialize().catch((err) => {
      log.error("Skills initialization failed", err);
    });
  }

  private async initialize(): Promise<void> {
    // On first run (or after app update), copy the entire bundled plugin to the runtime dir.
    // On subsequent starts the runtime dir already exists — just overlay any cached downloaded skills.
    if (!existsSync(join(this.runtimePluginDir, "plugin.json"))) {
      await this.copyBundledPlugin();
    }

    // Overlay any previously-downloaded skills on top of the runtime plugin
    await this.overlayDownloadedSkills();

    await this.syncCodexSkills();

    // Start periodic updates
    this.intervalId = setInterval(() => {
      this.updateSkills().catch((err) => {
        log.warn("Periodic skills update failed", err);
      });
    }, UPDATE_INTERVAL_MS);

    // Kick off first download
    await this.updateSkills();
  }

  /**
   * Returns the path to the plugin directory that should be used for agent sessions.
   *
   * - In dev mode: Vite already merged shipped + remote + local-dev skills, so use bundled path.
   * - In prod: use the runtime plugin dir (with downloaded updates).
   * - Fallback: bundled plugin path.
   */
  getPluginPath(): string {
    if (!app.isPackaged) {
      return this.bundledPluginDir;
    }

    if (existsSync(join(this.runtimePluginDir, "plugin.json"))) {
      return this.runtimePluginDir;
    }

    return this.bundledPluginDir;
  }

  async updateSkills(): Promise<void> {
    const now = Date.now();
    if (now - this.lastCheckAt < UPDATE_INTERVAL_MS) {
      return;
    }

    if (this.updating) {
      return;
    }

    this.updating = true;
    this.lastCheckAt = now;

    try {
      const tempDir = join(tmpdir(), `twig-skills-${Date.now()}`);
      await mkdir(tempDir, { recursive: true });

      try {
        const zipPath = join(tempDir, "skills.zip");
        await this.downloadFile(SKILLS_ZIP_URL, zipPath);

        const extractDir = join(tempDir, "extracted");
        await mkdir(extractDir, { recursive: true });
        await execFileAsync("unzip", ["-o", zipPath, "-d", extractDir]);

        const skillsSource = await this.findSkillsDir(extractDir);
        if (!skillsSource) {
          log.warn("No skills directory found in downloaded archive");
          return;
        }

        // Atomic swap into runtime skills cache
        const newSkillsDir = `${this.runtimeSkillsDir}.new`;
        await rm(newSkillsDir, { recursive: true, force: true });
        await cp(skillsSource, newSkillsDir, { recursive: true });

        const oldSkillsDir = `${this.runtimeSkillsDir}.old`;
        await rm(oldSkillsDir, { recursive: true, force: true });
        if (existsSync(this.runtimeSkillsDir)) {
          await rename(this.runtimeSkillsDir, oldSkillsDir);
        }
        await rename(newSkillsDir, this.runtimeSkillsDir);
        await rm(oldSkillsDir, { recursive: true, force: true });

        // Overlay new skills into the runtime plugin dir
        await this.overlayDownloadedSkills();

        await this.syncCodexSkills();

        log.info("Skills updated successfully");
        this.emit("updated", true);
      } finally {
        await rm(tempDir, { recursive: true, force: true });
      }
    } catch (err) {
      log.warn("Failed to update skills, will retry next interval", err);
    } finally {
      this.updating = false;
    }
  }

  /**
   * Copies the entire bundled plugin directory to the runtime location.
   * Called once on first run or after an app update.
   */
  private async copyBundledPlugin(): Promise<void> {
    try {
      if (!existsSync(this.bundledPluginDir)) {
        log.warn("Bundled plugin dir not found", {
          path: this.bundledPluginDir,
        });
        return;
      }
      await rm(this.runtimePluginDir, { recursive: true, force: true });
      await cp(this.bundledPluginDir, this.runtimePluginDir, {
        recursive: true,
      });
      log.info("Bundled plugin copied to runtime dir");
    } catch (err) {
      log.warn("Failed to copy bundled plugin", err);
    }
  }

  /**
   * Overlays previously-downloaded skills on top of the runtime plugin dir.
   * Each skill directory in the cache replaces the same-named one in the plugin.
   */
  private async overlayDownloadedSkills(): Promise<void> {
    if (!existsSync(this.runtimeSkillsDir)) {
      return;
    }

    const destSkillsDir = join(this.runtimePluginDir, "skills");
    await mkdir(destSkillsDir, { recursive: true });

    const entries = await readdir(this.runtimeSkillsDir, {
      withFileTypes: true,
    });
    for (const entry of entries) {
      if (entry.isDirectory()) {
        const src = join(this.runtimeSkillsDir, entry.name);
        const dest = join(destSkillsDir, entry.name);
        await rm(dest, { recursive: true, force: true });
        await cp(src, dest, { recursive: true });
      }
    }
  }

  /**
   * Syncs skills from the effective plugin dir to $HOME/.agents/skills/ for Codex.
   */
  private async syncCodexSkills(): Promise<void> {
    const effectiveSkillsDir = join(this.getPluginPath(), "skills");
    if (!existsSync(effectiveSkillsDir)) {
      return;
    }

    // Fire-and-forget — don't block startup or updates on Codex sync
    try {
      await mkdir(CODEX_SKILLS_DIR, { recursive: true });

      const entries = await readdir(effectiveSkillsDir, {
        withFileTypes: true,
      });
      for (const entry of entries) {
        if (entry.isDirectory()) {
          const src = join(effectiveSkillsDir, entry.name);
          const dest = join(CODEX_SKILLS_DIR, entry.name);
          await rm(dest, { recursive: true, force: true });
          await cp(src, dest, { recursive: true });
        }
      }

      log.debug("Skills synced to Codex", { path: CODEX_SKILLS_DIR });
    } catch (err) {
      log.warn("Failed to sync skills to Codex", err);
    }
  }

  private async downloadFile(url: string, destPath: string): Promise<void> {
    const response = await net.fetch(url);
    if (!response.ok) {
      throw new Error(
        `Download failed: ${response.status} ${response.statusText}`,
      );
    }

    const buffer = await response.arrayBuffer();
    await writeFile(destPath, Buffer.from(buffer));
  }

  /**
   * Finds the skills directory inside an extracted zip.
   * Handles: skills/ at root, nested (e.g. posthog/skills/), or skill dirs directly at root.
   */
  private async findSkillsDir(extractDir: string): Promise<string | null> {
    const direct = join(extractDir, "skills");
    if (existsSync(direct)) {
      return direct;
    }

    const entries = await readdir(extractDir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory()) {
        const nested = join(extractDir, entry.name, "skills");
        if (existsSync(nested)) {
          return nested;
        }
      }
    }

    const hasSkillDirs = entries.some(
      (e) =>
        e.isDirectory() && existsSync(join(extractDir, e.name, "SKILL.md")),
    );
    if (hasSkillDirs) {
      return extractDir;
    }

    return null;
  }

  @preDestroy()
  cleanup(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }
}
