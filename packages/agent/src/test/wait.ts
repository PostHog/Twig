export interface WaitOptions {
  timeout?: number;
  interval?: number;
}

export async function waitForCondition(
  condition: () => boolean | Promise<boolean>,
  options: WaitOptions = {},
): Promise<void> {
  const { timeout = 1000, interval = 20 } = options;
  const start = Date.now();

  while (true) {
    const result = await condition();
    if (result) {
      return;
    }

    if (Date.now() - start > timeout) {
      throw new Error(`Condition not met within ${timeout}ms`);
    }

    await new Promise((r) => setTimeout(r, interval));
  }
}

export async function waitForArrayLength<T>(
  getArray: () => T[],
  minLength: number,
  options: WaitOptions = {},
): Promise<void> {
  await waitForCondition(() => getArray().length >= minLength, options);
}

export async function waitForCallCount(
  mockFn: { mock: { calls: unknown[][] } },
  minCalls: number,
  options: WaitOptions = {},
): Promise<void> {
  await waitForCondition(() => mockFn.mock.calls.length >= minCalls, options);
}
