import { spawn, spawnSync } from "node:child_process";

export interface CommandResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

interface ExecuteOptions {
  cwd: string;
  env?: Record<string, string>;
  timeout?: number;
}

export interface CommandExecutor {
  execute(
    command: string,
    args: string[],
    options: ExecuteOptions,
  ): Promise<CommandResult>;
}

function createExecutor(): CommandExecutor {
  return {
    async execute(
      command: string,
      args: string[],
      options: ExecuteOptions,
    ): Promise<CommandResult> {
      return new Promise((resolve, reject) => {
        const proc = spawn(command, args, {
          cwd: options.cwd,
          env: { ...process.env, ...options.env },
        });

        const timeoutMs = options.timeout ?? 30000;
        const timeout = setTimeout(() => {
          proc.kill();
          reject(new Error(`Command timed out after ${timeoutMs}ms`));
        }, timeoutMs);

        const stdoutChunks: Buffer[] = [];
        const stderrChunks: Buffer[] = [];

        proc.stdout.on("data", (chunk) => stdoutChunks.push(chunk));
        proc.stderr.on("data", (chunk) => stderrChunks.push(chunk));

        proc.on("close", (exitCode) => {
          clearTimeout(timeout);
          resolve({
            stdout: Buffer.concat(stdoutChunks).toString(),
            stderr: Buffer.concat(stderrChunks).toString(),
            exitCode: exitCode ?? 1,
          });
        });

        proc.on("error", (err) => {
          clearTimeout(timeout);
          reject(err);
        });
      });
    },
  };
}

export const shellExecutor = createExecutor();

interface SyncOptions {
  cwd?: string;
  input?: string;
  onError?: "throw" | "ignore";
}

/**
 * Run a command synchronously.
 * Returns stdout on success, throws or returns empty string on failure.
 */
export function runSync(
  command: string,
  args: string[],
  options?: SyncOptions,
): string {
  const result = spawnSync(command, args, {
    cwd: options?.cwd ?? process.cwd(),
    input: options?.input,
    encoding: "utf-8",
  });

  if (result.status !== 0) {
    if (options?.onError === "ignore") return "";
    throw new Error(`${command} ${args.join(" ")} failed: ${result.stderr}`);
  }

  return (result.stdout ?? "").trim();
}

/**
 * Run a command synchronously and split output into lines.
 */
export function runSyncLines(
  command: string,
  args: string[],
  options?: SyncOptions,
): string[] {
  return runSync(command, args, options)
    .split("\n")
    .filter((line) => line.length > 0);
}

/**
 * Run an async command and check if it succeeded.
 */
export async function cmdCheck(
  command: string,
  args: string[],
  cwd: string,
  executor: CommandExecutor = shellExecutor,
): Promise<boolean> {
  try {
    const result = await executor.execute(command, args, { cwd });
    return result.exitCode === 0;
  } catch {
    return false;
  }
}

/**
 * Run an async command and return stdout if successful, null otherwise.
 */
export async function cmdOutput(
  command: string,
  args: string[],
  cwd: string,
  executor: CommandExecutor = shellExecutor,
): Promise<string | null> {
  try {
    const result = await executor.execute(command, args, { cwd });
    if (result.exitCode === 0) {
      return result.stdout.trim();
    }
    return null;
  } catch {
    return null;
  }
}
