export type Result<T, E = JJError> =
  | { ok: true; value: T }
  | { ok: false; error: E };

export function ok<T>(value: T): Result<T, never> {
  return { ok: true, value };
}

export function err<E>(error: E): Result<never, E> {
  return { ok: false, error };
}

interface JJError {
  code: JJErrorCode;
  message: string;
  command?: string;
  stderr?: string;
}

export type JJErrorCode =
  | "NOT_IN_REPO"
  | "NOT_INITIALIZED"
  | "COMMAND_FAILED"
  | "CONFLICT"
  | "INVALID_REVISION"
  | "INVALID_STATE"
  | "WORKSPACE_NOT_FOUND"
  | "PARSE_ERROR"
  | "DEPENDENCY_MISSING"
  | "NAVIGATION_FAILED"
  | "MERGE_BLOCKED"
  | "ALREADY_MERGED"
  | "UNKNOWN";

export function createError(
  code: JJErrorCode,
  message: string,
  details?: { command?: string; stderr?: string },
): JJError {
  return {
    code,
    message,
    ...details,
  };
}

export function unwrap<T>(result: Result<T>): T {
  if (!result.ok) {
    throw new Error(`unwrap called on error result: ${result.error.message}`);
  }
  return result.value;
}
