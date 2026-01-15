import { homedir } from "node:os";
import { join } from "node:path";
import { z } from "zod";
import { type CommandExecutor, shellExecutor } from "./executor";
import { createError, err, ok, type Result } from "./result";

const AuthStateSchema = z.object({
  version: z.literal(1),
  ghAuthenticated: z.boolean(),
  username: z.string().optional(),
});

type AuthState = z.infer<typeof AuthStateSchema>;

const AUTH_CONFIG_DIR = ".config/array";
const AUTH_FILE = "auth.json";

function getAuthPath(): string {
  return join(homedir(), AUTH_CONFIG_DIR, AUTH_FILE);
}

export async function saveAuthState(state: AuthState): Promise<void> {
  const authDir = join(homedir(), AUTH_CONFIG_DIR);
  const authPath = getAuthPath();

  await ensureDir(authDir);
  const { writeFile } = await import("node:fs/promises");
  await writeFile(authPath, JSON.stringify(state, null, 2));
}

interface GhAuthStatus {
  authenticated: boolean;
  username?: string;
  error?: string;
}

export async function checkGhAuth(
  executor: CommandExecutor = shellExecutor,
): Promise<GhAuthStatus> {
  try {
    const result = await executor.execute("gh", ["auth", "status"], {
      cwd: process.cwd(),
    });

    if (result.exitCode === 0) {
      const usernameMatch = result.stdout.match(
        /Logged in to github\.com account (\S+)/,
      );
      const username = usernameMatch ? usernameMatch[1] : undefined;
      return { authenticated: true, username };
    }

    return { authenticated: false, error: result.stderr };
  } catch (e) {
    return { authenticated: false, error: `Failed to check gh auth: ${e}` };
  }
}

export async function ghAuthLogin(
  executor: CommandExecutor = shellExecutor,
): Promise<Result<string>> {
  try {
    const result = await executor.execute("gh", ["auth", "login", "--web"], {
      cwd: process.cwd(),
    });

    if (result.exitCode !== 0) {
      return err(
        createError(
          "COMMAND_FAILED",
          result.stderr || "Failed to authenticate with GitHub",
        ),
      );
    }

    const status = await checkGhAuth(executor);
    if (!status.authenticated) {
      return err(createError("COMMAND_FAILED", "Authentication failed"));
    }

    return ok(status.username || "unknown");
  } catch (e) {
    return err(createError("COMMAND_FAILED", `Failed to authenticate: ${e}`));
  }
}

export async function isGhInstalled(
  executor: CommandExecutor = shellExecutor,
): Promise<boolean> {
  try {
    const result = await executor.execute("which", ["gh"], {
      cwd: process.cwd(),
    });
    return result.exitCode === 0;
  } catch {
    return false;
  }
}

async function ensureDir(dirPath: string): Promise<void> {
  try {
    const { mkdir } = await import("node:fs/promises");
    await mkdir(dirPath, { recursive: true });
  } catch {
    // Directory might already exist
  }
}
