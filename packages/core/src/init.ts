import { join } from "node:path";
import { shellExecutor } from "./executor";
import { createError, err, ok, type Result } from "./result";

export interface Prerequisites {
  git: { found: boolean; version?: string; path?: string };
  jj: { found: boolean; version?: string; path?: string };
}

export async function checkPrerequisites(): Promise<Prerequisites> {
  const [git, jj] = await Promise.all([checkBinary("git"), checkBinary("jj")]);

  return { git, jj };
}

async function checkBinary(
  name: string,
): Promise<{ found: boolean; version?: string; path?: string }> {
  try {
    const whichResult = await shellExecutor.execute("which", [name], {
      cwd: process.cwd(),
    });
    if (whichResult.exitCode !== 0) {
      return { found: false };
    }

    const path = whichResult.stdout.trim();
    const versionResult = await shellExecutor.execute(name, ["--version"], {
      cwd: process.cwd(),
    });
    const version = versionResult.stdout.trim().split("\n")[0];

    return { found: true, version, path };
  } catch {
    return { found: false };
  }
}

export async function isJjInitialized(cwd: string): Promise<boolean> {
  const jjDir = join(cwd, ".jj");
  try {
    const { stat } = await import("node:fs/promises");
    const stats = await stat(jjDir);
    return stats.isDirectory();
  } catch {
    return false;
  }
}

export async function initJj(cwd: string): Promise<Result<void>> {
  try {
    const result = await shellExecutor.execute(
      "jj",
      ["git", "init", "--colocate"],
      { cwd },
    );
    if (result.exitCode !== 0) {
      return err(
        createError(
          "COMMAND_FAILED",
          result.stderr || "Failed to initialize jj",
        ),
      );
    }
    return ok(undefined);
  } catch (e) {
    return err(createError("COMMAND_FAILED", `Failed to initialize jj: ${e}`));
  }
}

export async function configureTrunk(
  cwd: string,
  trunk: string,
): Promise<Result<void>> {
  try {
    const result = await shellExecutor.execute(
      "jj",
      ["config", "set", "--repo", 'revset-aliases."trunk()"', trunk],
      { cwd },
    );
    if (result.exitCode !== 0) {
      return err(
        createError(
          "COMMAND_FAILED",
          result.stderr || "Failed to configure trunk",
        ),
      );
    }
    return ok(undefined);
  } catch (e) {
    return err(
      createError("COMMAND_FAILED", `Failed to configure trunk: ${e}`),
    );
  }
}

export async function installJj(
  method: "brew" | "cargo",
): Promise<Result<void>> {
  try {
    const cmd =
      method === "brew"
        ? ["brew", ["install", "jj"]]
        : ["cargo", ["install", "jj-cli"]];
    const result = await shellExecutor.execute(
      cmd[0] as string,
      cmd[1] as string[],
      { cwd: process.cwd() },
    );
    if (result.exitCode !== 0) {
      return err(
        createError(
          "COMMAND_FAILED",
          result.stderr || `Failed to install jj via ${method}`,
        ),
      );
    }
    return ok(undefined);
  } catch (e) {
    return err(createError("COMMAND_FAILED", `Failed to install jj: ${e}`));
  }
}
