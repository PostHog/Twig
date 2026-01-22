declare module "tar" {
  interface CreateOptions {
    gzip?: boolean;
    file?: string;
    cwd?: string;
  }

  interface ExtractOptions {
    file?: string;
    cwd?: string;
  }

  export function create(
    options: CreateOptions,
    files: string[],
  ): Promise<void>;
  export function extract(options: ExtractOptions): Promise<void>;
}
