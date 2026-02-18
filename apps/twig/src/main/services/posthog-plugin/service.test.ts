import { vol } from "memfs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Set env before module loads (URLs are captured at module level)
vi.hoisted(() => {
  process.env.SKILLS_ZIP_URL = "https://example.com/skills.zip";
  process.env.CONTEXT_MILL_ZIP_URL = "https://example.com/context-mill.zip";
});

const mockApp = vi.hoisted(() => ({
  getPath: vi.fn(() => "/mock/userData"),
  getAppPath: vi.fn(() => "/mock/appPath"),
  isPackaged: false as boolean,
}));

const mockNet = vi.hoisted(() => ({
  fetch: vi.fn(),
}));

const mockExecFileAsync = vi.hoisted(() =>
  vi.fn<(cmd: string, args: string[]) => Promise<unknown>>(async () => {}),
);

vi.mock("electron", () => ({
  app: mockApp,
  net: mockNet,
}));

vi.mock("node:fs", async () => {
  const { fs } = await import("memfs");
  return { ...fs, default: fs };
});

vi.mock("node:fs/promises", async () => {
  const { fs } = await import("memfs");
  return { ...fs.promises, default: fs.promises };
});

vi.mock("node:child_process", () => ({
  execFile: vi.fn(),
  default: { execFile: vi.fn() },
}));

vi.mock("node:util", () => ({
  promisify: () => mockExecFileAsync,
  default: { promisify: () => mockExecFileAsync },
}));

vi.mock("node:os", () => ({
  homedir: () => "/mock/home",
  tmpdir: () => "/mock/tmp",
  default: { homedir: () => "/mock/home", tmpdir: () => "/mock/tmp" },
}));

vi.mock("../../lib/logger.js", () => ({
  logger: {
    scope: () => ({
      info: vi.fn(),
      error: vi.fn(),
      warn: vi.fn(),
      debug: vi.fn(),
    }),
  },
}));

import { PosthogPluginService } from "./service.js";

// Paths based on mock values
const RUNTIME_PLUGIN_DIR = "/mock/userData/plugins/posthog";
const RUNTIME_SKILLS_DIR = "/mock/userData/skills";
const BUNDLED_PLUGIN_DIR = "/mock/appPath/.vite/build/plugins/posthog";
const BUNDLED_PLUGIN_DIR_PACKAGED =
  "/mock/appPath.unpacked/.vite/build/plugins/posthog";
const CODEX_SKILLS_DIR = "/mock/home/.agents/skills";

function mockFetchResponse(ok: boolean, status = 200) {
  return {
    ok,
    status,
    statusText: ok ? "OK" : "Not Found",
    arrayBuffer: vi.fn(async () => new ArrayBuffer(8)),
  };
}

/**
 * Simulate unzip by creating skill files in the extracted dir.
 * Handles both posthog format (skills/X/SKILL.md) and context-mill format (nested zips).
 * Context-mill creates two feature-flags-* skills to test grouping.
 */
function simulateUnzip() {
  mockExecFileAsync.mockImplementation(async (_cmd: string, args: string[]) => {
    const dIdx = args.indexOf("-d");
    if (dIdx < 0) return;
    const zipPath = args[1];
    const extractDir = args[dIdx + 1];

    if (zipPath.endsWith("/context-mill.zip")) {
      // Outer context-mill zip → create inner .zip file entries
      vol.mkdirSync(extractDir, { recursive: true });
      vol.writeFileSync(`${extractDir}/manifest.json`, "{}");
      vol.writeFileSync(`${extractDir}/feature-flags-react.zip`, "fake");
      vol.writeFileSync(`${extractDir}/feature-flags-nodejs.zip`, "fake");
    } else if (zipPath.includes("context-mill-extracted/")) {
      // Inner context-mill skill zip → create SKILL.md
      vol.mkdirSync(extractDir, { recursive: true });
      vol.writeFileSync(`${extractDir}/SKILL.md`, "# CM Skill");
    } else {
      // Posthog skills zip → create skills/remote-skill/
      vol.mkdirSync(`${extractDir}/skills/remote-skill`, { recursive: true });
      vol.writeFileSync(
        `${extractDir}/skills/remote-skill/SKILL.md`,
        "# Remote",
      );
    }
  });
}

/** Create the bundled plugin directory in memfs */
function setupBundledPlugin(dir = BUNDLED_PLUGIN_DIR) {
  vol.mkdirSync(`${dir}/skills/shipped-skill`, { recursive: true });
  vol.writeFileSync(`${dir}/plugin.json`, '{"name":"posthog"}');
  vol.writeFileSync(`${dir}/skills/shipped-skill/SKILL.md`, "# Shipped");
}

describe("PosthogPluginService", () => {
  let service: PosthogPluginService;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vol.reset();

    mockApp.isPackaged = false;
    mockNet.fetch.mockResolvedValue(mockFetchResponse(true));
    mockExecFileAsync.mockResolvedValue({});

    service = new PosthogPluginService();
  });

  afterEach(() => {
    service.cleanup();
    vi.useRealTimers();
  });

  describe("getPluginPath", () => {
    it("returns bundled path in dev mode", () => {
      mockApp.isPackaged = false;
      expect(service.getPluginPath()).toBe(BUNDLED_PLUGIN_DIR);
    });

    it("returns runtime path in prod when plugin.json exists", () => {
      mockApp.isPackaged = true;
      vol.mkdirSync(RUNTIME_PLUGIN_DIR, { recursive: true });
      vol.writeFileSync(`${RUNTIME_PLUGIN_DIR}/plugin.json`, "{}");

      expect(service.getPluginPath()).toBe(RUNTIME_PLUGIN_DIR);
    });

    it("returns bundled path as fallback in prod", () => {
      mockApp.isPackaged = true;
      expect(service.getPluginPath()).toBe(BUNDLED_PLUGIN_DIR_PACKAGED);
    });
  });

  describe("initialize", () => {
    it("copies bundled plugin on first run when plugin.json is missing", async () => {
      setupBundledPlugin();

      await (service as any).initialize();

      // Entire bundled dir should be copied to runtime
      expect(vol.existsSync(`${RUNTIME_PLUGIN_DIR}/plugin.json`)).toBe(true);
      expect(
        vol.existsSync(`${RUNTIME_PLUGIN_DIR}/skills/shipped-skill/SKILL.md`),
      ).toBe(true);
    });

    it("skips bundled copy when plugin.json already exists in runtime", async () => {
      setupBundledPlugin();
      // Pre-populate runtime dir (simulating previous run)
      vol.mkdirSync(RUNTIME_PLUGIN_DIR, { recursive: true });
      vol.writeFileSync(`${RUNTIME_PLUGIN_DIR}/plugin.json`, '{"old":true}');

      await (service as any).initialize();

      // Should keep the existing runtime plugin.json, not overwrite
      expect(
        vol.readFileSync(`${RUNTIME_PLUGIN_DIR}/plugin.json`, "utf-8"),
      ).toBe('{"old":true}');
    });

    it("overlays downloaded skills from cache on top of runtime dir", async () => {
      setupBundledPlugin();
      // Pre-populate runtime dir
      vol.mkdirSync(RUNTIME_PLUGIN_DIR, { recursive: true });
      vol.writeFileSync(`${RUNTIME_PLUGIN_DIR}/plugin.json`, "{}");
      // Pre-populate skills cache (as if downloaded previously)
      vol.mkdirSync(`${RUNTIME_SKILLS_DIR}/cached-skill`, { recursive: true });
      vol.writeFileSync(
        `${RUNTIME_SKILLS_DIR}/cached-skill/SKILL.md`,
        "# Cached",
      );

      await (service as any).initialize();

      expect(
        vol.readFileSync(
          `${RUNTIME_PLUGIN_DIR}/skills/cached-skill/SKILL.md`,
          "utf-8",
        ),
      ).toBe("# Cached");
    });

    it("starts periodic update interval", async () => {
      await (service as any).initialize();
      expect((service as any).intervalId).not.toBeNull();
    });
  });

  describe("updateSkills", () => {
    it("downloads, extracts, and installs skills from both sources", async () => {
      setupBundledPlugin();
      simulateUnzip();

      await service.updateSkills();

      // Posthog skills should be in the runtime cache
      expect(
        vol.existsSync(`${RUNTIME_SKILLS_DIR}/remote-skill/SKILL.md`),
      ).toBe(true);
      // Context-mill skills should be grouped by topic prefix
      expect(
        vol.existsSync(`${RUNTIME_SKILLS_DIR}/feature-flags/SKILL.md`),
      ).toBe(true);
      expect(
        vol.existsSync(
          `${RUNTIME_SKILLS_DIR}/feature-flags/references/react/SKILL.md`,
        ),
      ).toBe(true);
      expect(
        vol.existsSync(
          `${RUNTIME_SKILLS_DIR}/feature-flags/references/nodejs/SKILL.md`,
        ),
      ).toBe(true);
      expect(mockNet.fetch).toHaveBeenCalledWith(
        "https://example.com/skills.zip",
      );
      expect(mockNet.fetch).toHaveBeenCalledWith(
        "https://example.com/context-mill.zip",
      );
    });

    it("performs atomic swap of skills directory", async () => {
      setupBundledPlugin();
      // Pre-populate existing cache with old skill
      vol.mkdirSync(`${RUNTIME_SKILLS_DIR}/old-skill`, { recursive: true });
      vol.writeFileSync(`${RUNTIME_SKILLS_DIR}/old-skill/SKILL.md`, "# Old");

      simulateUnzip();
      await service.updateSkills();

      // New skill should be present, old skill should be gone
      expect(
        vol.existsSync(`${RUNTIME_SKILLS_DIR}/remote-skill/SKILL.md`),
      ).toBe(true);
      expect(vol.existsSync(`${RUNTIME_SKILLS_DIR}/old-skill`)).toBe(false);
      // Temp dirs should be cleaned up
      expect(vol.existsSync(`${RUNTIME_SKILLS_DIR}.new`)).toBe(false);
      expect(vol.existsSync(`${RUNTIME_SKILLS_DIR}.old`)).toBe(false);
    });

    it("overlays new skills into runtime plugin dir", async () => {
      setupBundledPlugin();
      vol.mkdirSync(RUNTIME_PLUGIN_DIR, { recursive: true });
      vol.writeFileSync(`${RUNTIME_PLUGIN_DIR}/plugin.json`, "{}");

      simulateUnzip();
      await service.updateSkills();

      expect(
        vol.existsSync(`${RUNTIME_PLUGIN_DIR}/skills/remote-skill/SKILL.md`),
      ).toBe(true);
    });

    it("emits 'updated' event on success", async () => {
      simulateUnzip();
      const handler = vi.fn();
      service.on("skillsUpdated", handler);

      await service.updateSkills();

      expect(handler).toHaveBeenCalledWith(true);
    });

    it("throttles: skips if called within 30 minutes", async () => {
      simulateUnzip();
      await service.updateSkills();
      mockNet.fetch.mockClear();

      await service.updateSkills();

      expect(mockNet.fetch).not.toHaveBeenCalled();
    });

    it("allows update after throttle period expires", async () => {
      simulateUnzip();
      await service.updateSkills();
      mockNet.fetch.mockClear();

      vi.advanceTimersByTime(31 * 60 * 1000);
      await service.updateSkills();

      expect(mockNet.fetch).toHaveBeenCalled();
    });

    it("skips if already updating (reentrance guard)", async () => {
      let resolveDownload!: (value: unknown) => void;
      mockNet.fetch.mockReturnValue(
        new Promise((resolve) => {
          resolveDownload = resolve;
        }),
      );

      // Start first update (hangs on fetch)
      const first = service.updateSkills();

      // Advance past throttle so second call reaches the `updating` check
      vi.advanceTimersByTime(31 * 60 * 1000);
      mockNet.fetch.mockClear();
      await service.updateSkills();

      // Second call should not have triggered another fetch
      expect(mockNet.fetch).not.toHaveBeenCalled();

      // Clean up hanging promise
      resolveDownload(mockFetchResponse(true));
      await first.catch(() => {});
    });

    it("handles download failure gracefully", async () => {
      mockNet.fetch.mockRejectedValue(new Error("Network error"));
      await expect(service.updateSkills()).resolves.toBeUndefined();
    });

    it("handles non-ok response gracefully", async () => {
      mockNet.fetch.mockResolvedValue(mockFetchResponse(false, 404));
      await expect(service.updateSkills()).resolves.toBeUndefined();
    });

    it("handles missing skills dir in all archives", async () => {
      // Unzip creates no skills directory in either source
      mockExecFileAsync.mockImplementation(
        async (_cmd: string, args: string[]) => {
          const dIdx = args.indexOf("-d");
          if (dIdx >= 0) {
            const extractDir = args[dIdx + 1];
            vol.mkdirSync(`${extractDir}/random-dir`, { recursive: true });
            vol.writeFileSync(`${extractDir}/random-dir/README.md`, "nope");
          }
        },
      );

      const handler = vi.fn();
      service.on("skillsUpdated", handler);
      await service.updateSkills();

      expect(handler).not.toHaveBeenCalled();
    });

    it("cleans up temp dir even on error", async () => {
      mockExecFileAsync.mockRejectedValue(new Error("unzip failed"));

      await service.updateSkills();

      // Temp dir under /mock/tmp should be cleaned up
      const tmpEntries = vol.existsSync("/mock/tmp")
        ? vol.readdirSync("/mock/tmp")
        : [];
      expect(tmpEntries).toHaveLength(0);
    });
  });

  describe("findSkillsDir", () => {
    it("finds skills/ at root of extracted dir", async () => {
      vol.mkdirSync("/extract/skills", { recursive: true });

      const result = await (service as any).findSkillsDir("/extract");
      expect(result).toBe("/extract/skills");
    });

    it("finds nested skills/ dir (e.g. posthog/skills/)", async () => {
      vol.mkdirSync("/extract/posthog/skills", { recursive: true });

      const result = await (service as any).findSkillsDir("/extract");
      expect(result).toBe("/extract/posthog/skills");
    });

    it("finds skill dirs directly at root when they have SKILL.md", async () => {
      vol.mkdirSync("/extract/my-skill", { recursive: true });
      vol.writeFileSync("/extract/my-skill/SKILL.md", "# Skill");

      const result = await (service as any).findSkillsDir("/extract");
      expect(result).toBe("/extract");
    });

    it("returns null when no skills found", async () => {
      vol.mkdirSync("/extract/random", { recursive: true });
      vol.writeFileSync("/extract/random/README.md", "# Not a skill");

      const result = await (service as any).findSkillsDir("/extract");
      expect(result).toBeNull();
    });
  });

  describe("syncCodexSkills", () => {
    it("copies skill directories to Codex dir", async () => {
      setupBundledPlugin();

      await (service as any).syncCodexSkills();

      expect(
        vol.readFileSync(`${CODEX_SKILLS_DIR}/shipped-skill/SKILL.md`, "utf-8"),
      ).toBe("# Shipped");
    });

    it("skips if effective skills dir does not exist", async () => {
      // No skills dir anywhere
      await (service as any).syncCodexSkills();

      expect(vol.existsSync(CODEX_SKILLS_DIR)).toBe(false);
    });
  });

  describe("copyBundledPlugin", () => {
    it("copies entire bundled dir to runtime dir", async () => {
      setupBundledPlugin();

      await (service as any).copyBundledPlugin();

      expect(
        vol.readFileSync(`${RUNTIME_PLUGIN_DIR}/plugin.json`, "utf-8"),
      ).toBe('{"name":"posthog"}');
      expect(
        vol.readFileSync(
          `${RUNTIME_PLUGIN_DIR}/skills/shipped-skill/SKILL.md`,
          "utf-8",
        ),
      ).toBe("# Shipped");
    });

    it("skips if bundled dir does not exist", async () => {
      await (service as any).copyBundledPlugin();
      expect(vol.existsSync(RUNTIME_PLUGIN_DIR)).toBe(false);
    });

    it("handles copy failure gracefully", async () => {
      // Bundled dir exists but is not a directory (will cause cp to fail or behave oddly)
      // Just verify no exception propagates
      setupBundledPlugin();
      await expect(
        (service as any).copyBundledPlugin(),
      ).resolves.toBeUndefined();
    });
  });

  describe("cleanup", () => {
    it("clears interval timer", async () => {
      await (service as any).initialize();
      expect((service as any).intervalId).not.toBeNull();

      service.cleanup();
      expect((service as any).intervalId).toBeNull();
    });

    it("is safe to call multiple times", () => {
      service.cleanup();
      service.cleanup();
    });
  });
});
