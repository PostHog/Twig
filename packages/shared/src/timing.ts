export interface TimingCollector {
  time: <T>(label: string, fn: () => Promise<T>) => Promise<T>;
  timeSync: <T>(label: string, fn: () => T) => T;
  record: (label: string, ms: number) => void;
  summarize: (label: string) => void;
}

const NOOP_COLLECTOR: TimingCollector = {
  time: <T>(_label: string, fn: () => Promise<T>) => fn(),
  timeSync: <T>(_label: string, fn: () => T) => fn(),
  record: () => {},
  summarize: () => {},
};

/**
 * Creates a timing collector that accumulates step durations and emits
 * a single consolidated log via summarize(). When disabled, returns
 * a no-op collector that passes through functions without measuring.
 *
 * @param enabled - Whether to actually measure timings
 * @param log - Function to call with the consolidated timing summary
 */
export function createTimingCollector(
  enabled: boolean,
  log: (message: string, data: Record<string, number>) => void,
): TimingCollector {
  if (!enabled) return NOOP_COLLECTOR;

  const steps: Record<string, number> = {};

  return {
    async time<T>(label: string, fn: () => Promise<T>): Promise<T> {
      const start = Date.now();
      const result = await fn();
      steps[label] = Date.now() - start;
      return result;
    },
    timeSync<T>(label: string, fn: () => T): T {
      const start = Date.now();
      const result = fn();
      steps[label] = Date.now() - start;
      return result;
    },
    record(label: string, ms: number) {
      steps[label] = ms;
    },
    summarize(label: string) {
      const total = Object.values(steps).reduce((a, b) => a + b, 0);
      log(`[timing] ${label}: ${total}ms`, steps);
    },
  };
}
