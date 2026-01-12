import type { EventEmitter } from "node:events";
import type { Container } from "inversify";
import { vi } from "vitest";

export interface MockExecResult {
  stdout: string;
  stderr: string;
}

export interface MockSpawnProcess {
  stdout: EventEmitter;
  stderr: EventEmitter;
  on: ReturnType<typeof vi.fn>;
}

export class ServiceTestHarness {
  public mockExec = vi.fn<
    [command: string, options?: unknown],
    Promise<MockExecResult>
  >();
  public mockExecFile = vi.fn<
    [file: string, args?: string[], options?: unknown],
    Promise<MockExecResult>
  >();
  public mockSpawn = vi.fn<
    [command: string, args?: string[], options?: unknown],
    MockSpawnProcess
  >();

  public mockReadFile = vi.fn<
    [path: string, encoding: string],
    Promise<string>
  >();
  public mockWriteFile = vi.fn<[path: string, data: string], Promise<void>>();
  public mockReaddir = vi.fn<
    [path: string, options?: unknown],
    Promise<unknown[]>
  >();
  public mockStat = vi.fn<[path: string], Promise<unknown>>();

  constructor() {
    this.setupDefaultMocks();
  }

  private setupDefaultMocks() {
    this.mockExec.mockResolvedValue({ stdout: "", stderr: "" });
    this.mockExecFile.mockResolvedValue({ stdout: "", stderr: "" });
    this.mockReadFile.mockResolvedValue("");
    this.mockWriteFile.mockResolvedValue();
    this.mockReaddir.mockResolvedValue([]);
  }

  public createMockSpawnProcess(): MockSpawnProcess {
    const EventEmitter = require("node:events").EventEmitter;
    const stdout = new EventEmitter();
    const stderr = new EventEmitter();

    return {
      stdout,
      stderr,
      on: vi.fn(),
    };
  }

  public setExecResponse(
    command: string | RegExp,
    stdout: string,
    stderr = "",
  ): void {
    this.mockExec.mockImplementation(
      async (cmd: string, _options?: unknown) => {
        if (
          (typeof command === "string" && cmd.includes(command)) ||
          (command instanceof RegExp && command.test(cmd))
        ) {
          return { stdout, stderr };
        }
        return { stdout: "", stderr: "" };
      },
    );
  }

  public setExecFileResponse(
    file: string,
    args: string[] | RegExp,
    stdout: string,
    stderr = "",
  ): void {
    this.mockExecFile.mockImplementation(
      async (
        f: string,
        a?: string[],
        _options?: unknown,
      ): Promise<MockExecResult> => {
        if (f === file) {
          if (args instanceof RegExp) {
            if (args.test(a?.join(" ") || "")) {
              return { stdout, stderr };
            }
          } else if (
            a &&
            args.length === a.length &&
            args.every((arg, i) => arg === a[i])
          ) {
            return { stdout, stderr };
          }
        }
        return { stdout: "", stderr: "" };
      },
    );
  }

  public setExecError(command: string | RegExp, errorMessage: string): void {
    this.mockExec.mockImplementation(
      async (cmd: string, _options?: unknown) => {
        if (
          (typeof command === "string" && cmd.includes(command)) ||
          (command instanceof RegExp && command.test(cmd))
        ) {
          throw new Error(errorMessage);
        }
        return { stdout: "", stderr: "" };
      },
    );
  }

  public setExecFileError(
    file: string,
    args: string[] | RegExp,
    errorMessage: string,
  ): void {
    this.mockExecFile.mockImplementation(
      async (f: string, a?: string[], _options?: unknown) => {
        if (f === file) {
          if (args instanceof RegExp) {
            if (args.test(a?.join(" ") || "")) {
              throw new Error(errorMessage);
            }
          } else if (
            a &&
            args.length === a.length &&
            args.every((arg, i) => arg === a[i])
          ) {
            throw new Error(errorMessage);
          }
        }
        return { stdout: "", stderr: "" };
      },
    );
  }

  public setReadFileResponse(path: string | RegExp, content: string): void {
    this.mockReadFile.mockImplementation(
      async (p: string, _encoding: string) => {
        if (
          (typeof path === "string" && p.includes(path)) ||
          (path instanceof RegExp && path.test(p))
        ) {
          return content;
        }
        throw new Error(`ENOENT: no such file or directory, open '${p}'`);
      },
    );
  }

  public setReadFileError(path: string | RegExp, errorMessage: string): void {
    this.mockReadFile.mockImplementation(
      async (p: string, _encoding: string) => {
        if (
          (typeof path === "string" && p.includes(path)) ||
          (path instanceof RegExp && path.test(p))
        ) {
          throw new Error(errorMessage);
        }
        throw new Error(`ENOENT: no such file or directory, open '${p}'`);
      },
    );
  }

  public reset(): void {
    this.mockExec.mockClear();
    this.mockExecFile.mockClear();
    this.mockSpawn.mockClear();
    this.mockReadFile.mockClear();
    this.mockWriteFile.mockClear();
    this.mockReaddir.mockClear();
    this.mockStat.mockClear();
    this.setupDefaultMocks();
  }

  public getModuleMocks() {
    return {
      exec: this.mockExec,
      execFile: this.mockExecFile,
      spawn: this.mockSpawn,
      promises: {
        readFile: this.mockReadFile,
        writeFile: this.mockWriteFile,
        readdir: this.mockReaddir,
        stat: this.mockStat,
      },
    };
  }
}

export function createMockContainer(): Container {
  const mockContainer = {
    bind: vi.fn().mockReturnThis(),
    get: vi.fn(),
    isBound: vi.fn().mockReturnValue(false),
    rebind: vi.fn().mockReturnThis(),
    unbind: vi.fn().mockReturnThis(),
    unbindAll: vi.fn(),
    remove: vi.fn(),
    resolve: vi.fn(),
    to: vi.fn().mockReturnThis(),
    toSelf: vi.fn().mockReturnThis(),
    toConstantValue: vi.fn().mockReturnThis(),
    toDynamicValue: vi.fn().mockReturnThis(),
    toConstructor: vi.fn().mockReturnThis(),
    toFactory: vi.fn().mockReturnThis(),
    toFunction: vi.fn().mockReturnThis(),
    toAutoFactory: vi.fn().mockReturnThis(),
    toProvider: vi.fn().mockReturnThis(),
    inSingletonScope: vi.fn().mockReturnThis(),
    inTransientScope: vi.fn().mockReturnThis(),
    inRequestScope: vi.fn().mockReturnThis(),
    whenTargetNamed: vi.fn().mockReturnThis(),
    whenTargetTagged: vi.fn().mockReturnThis(),
    whenInjectedInto: vi.fn().mockReturnThis(),
    whenParentNamed: vi.fn().mockReturnThis(),
    whenParentTagged: vi.fn().mockReturnThis(),
    whenAnyAncestorIs: vi.fn().mockReturnThis(),
    whenNoAncestorIs: vi.fn().mockReturnThis(),
    whenAnyAncestorNamed: vi.fn().mockReturnThis(),
    whenNoAncestorNamed: vi.fn().mockReturnThis(),
    whenAnyAncestorTagged: vi.fn().mockReturnThis(),
    whenNoAncestorTagged: vi.fn().mockReturnThis(),
    whenAnyAncestorMatches: vi.fn().mockReturnThis(),
    whenNoAncestorMatches: vi.fn().mockReturnThis(),
    onActivation: vi.fn().mockReturnThis(),
    onDeactivation: vi.fn().mockReturnThis(),
  } as unknown as Container;

  return mockContainer;
}
