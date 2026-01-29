/**
 * Races an operation against a timeout.
 * Returns success with the value if the operation completes in time,
 * or timeout if the operation takes longer than the specified duration.
 */
export async function withTimeout<T>(
  operation: Promise<T>,
  timeoutMs: number,
): Promise<{ result: "success"; value: T } | { result: "timeout" }> {
  const timeoutPromise = new Promise<{ result: "timeout" }>((resolve) =>
    setTimeout(() => resolve({ result: "timeout" }), timeoutMs),
  );
  const operationPromise = operation.then((value) => ({
    result: "success" as const,
    value,
  }));
  return Promise.race([operationPromise, timeoutPromise]);
}
