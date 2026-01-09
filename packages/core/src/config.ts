import { homedir } from "node:os";
import { join } from "node:path";
import { z } from "zod";

const UserConfigSchema = z.object({
  version: z.literal(1),
  tipsEnabled: z.boolean().default(true),
  tipsSeen: z.array(z.string()).default([]),
});

type UserConfig = z.infer<typeof UserConfigSchema>;

const USER_CONFIG_DIR = ".config/array";
const USER_CONFIG_FILE = "config.json";

function getUserConfigDir(): string {
  return join(homedir(), USER_CONFIG_DIR);
}

function getUserConfigPath(): string {
  return join(getUserConfigDir(), USER_CONFIG_FILE);
}

export async function loadUserConfig(): Promise<UserConfig> {
  const configPath = getUserConfigPath();

  try {
    const file = Bun.file(configPath);
    if (!(await file.exists())) {
      return createDefaultUserConfig();
    }

    const content = await file.text();
    const parsed = JSON.parse(content);
    return UserConfigSchema.parse(parsed);
  } catch {
    return createDefaultUserConfig();
  }
}

export async function saveUserConfig(config: UserConfig): Promise<void> {
  const configDir = getUserConfigDir();
  const configPath = getUserConfigPath();

  await ensureDir(configDir);
  await Bun.write(configPath, JSON.stringify(config, null, 2));
}

export function createDefaultUserConfig(): UserConfig {
  return {
    version: 1,
    tipsEnabled: true,
    tipsSeen: [],
  };
}

export async function isRepoInitialized(cwd: string): Promise<boolean> {
  try {
    const { stat } = await import("node:fs/promises");
    const [gitExists, jjExists] = await Promise.all([
      stat(join(cwd, ".git"))
        .then(() => true)
        .catch(() => false),
      stat(join(cwd, ".jj"))
        .then(() => true)
        .catch(() => false),
    ]);
    return gitExists && jjExists;
  } catch {
    return false;
  }
}

export async function markTipSeen(tipId: string): Promise<void> {
  const config = await loadUserConfig();
  if (!config.tipsSeen.includes(tipId)) {
    config.tipsSeen.push(tipId);
    await saveUserConfig(config);
  }
}

export async function shouldShowTip(tipId: string): Promise<boolean> {
  const config = await loadUserConfig();
  return config.tipsEnabled && !config.tipsSeen.includes(tipId);
}

const TIPS: Record<string, string> = {
  create: "Run `arr log` to see your stack.",
  submit: "Run `arr sync` to pull latest changes.",
  enable: "Run `arr status` to see the combined preview.",
  log: "Use `arr up` and `arr down` to navigate.",
  sync: "Run `arr submit --stack` to create linked PRs.",
};

export function getTip(command: string): string | null {
  return TIPS[command] ?? null;
}

async function ensureDir(dirPath: string): Promise<void> {
  try {
    const { mkdir } = await import("node:fs/promises");
    await mkdir(dirPath, { recursive: true });
  } catch {
    // Directory might already exist
  }
}
