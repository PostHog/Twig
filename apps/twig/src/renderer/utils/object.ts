export function omitKey<T extends Record<string, unknown>>(
  obj: T,
  key: keyof T,
): Omit<T, typeof key> {
  const { [key]: _, ...rest } = obj;
  return rest;
}
