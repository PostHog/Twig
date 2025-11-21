/**
 * Simple logger utility with configurable debug mode
 */
export enum LogLevel {
  ERROR = 0,
  WARN = 1,
  INFO = 2,
  DEBUG = 3,
}

export interface LoggerConfig {
  debug?: boolean;
  prefix?: string;
}

export class Logger {
  private debugEnabled: boolean;
  private prefix: string;

  constructor(config: LoggerConfig = {}) {
    this.debugEnabled = config.debug ?? false;
    this.prefix = config.prefix ?? "[PostHog Agent]";
  }

  setDebug(enabled: boolean) {
    this.debugEnabled = enabled;
  }

  private formatMessage(
    level: string,
    message: string,
    data?: unknown,
  ): string {
    const timestamp = new Date().toISOString();
    const base = `${timestamp} ${this.prefix} ${level} ${message}`;

    if (data !== undefined) {
      return `${base} ${JSON.stringify(data, null, 2)}`;
    }

    return base;
  }

  error(message: string, error?: Error | unknown) {
    // Always log errors
    if (error instanceof Error) {
      console.error(
        this.formatMessage("[ERROR]", message, {
          message: error.message,
          stack: error.stack,
        }),
      );
    } else {
      console.error(this.formatMessage("[ERROR]", message, error));
    }
  }

  warn(message: string, data?: unknown) {
    if (this.debugEnabled) {
      console.warn(this.formatMessage("[WARN]", message, data));
    }
  }

  info(message: string, data?: unknown) {
    if (this.debugEnabled) {
      console.log(this.formatMessage("[INFO]", message, data));
    }
  }

  debug(message: string, data?: unknown) {
    if (this.debugEnabled) {
      console.log(this.formatMessage("[DEBUG]", message, data));
    }
  }

  /**
   * Create a child logger with additional prefix
   */
  child(childPrefix: string): Logger {
    return new Logger({
      debug: this.debugEnabled,
      prefix: `${this.prefix} [${childPrefix}]`,
    });
  }
}
