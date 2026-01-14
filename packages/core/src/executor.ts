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

function createShellExecutor(): CommandExecutor {
  return {
    async execute(
      command: string,
      args: string[],
      options: ExecuteOptions,
    ): Promise<CommandResult> {
      const proc = Bun.spawn([command, ...args], {
        cwd: options.cwd,
        env: { ...process.env, ...options.env },
        stdout: "pipe",
        stderr: "pipe",
      });

      const timeoutMs = options.timeout ?? 30000;
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => {
          proc.kill();
          reject(new Error(`Command timed out after ${timeoutMs}ms`));
        }, timeoutMs);
      });

      const resultPromise = (async () => {
        const [stdout, stderr] = await Promise.all([
          new Response(proc.stdout).text(),
          new Response(proc.stderr).text(),
        ]);
        const exitCode = await proc.exited;
        return { stdout, stderr, exitCode };
      })();

      return Promise.race([resultPromise, timeoutPromise]);
    },
  };
}

export const shellExecutor = createShellExecutor();

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
  const result = Bun.spawnSync([command, ...args], {
    cwd: options?.cwd ?? process.cwd(),
    stdin: options?.input ? Buffer.from(options.input) : undefined,
  });

  if (result.exitCode !== 0) {
    if (options?.onError === "ignore") return "";
    const stderr = result.stderr.toString();
    throw new Error(`${command} ${args.join(" ")} failed: ${stderr}`);
  }

  return result.stdout.toString().trim();
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
