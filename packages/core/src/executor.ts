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
