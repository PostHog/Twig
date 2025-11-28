export function randomSuffix(length = 8): string {
  return Math.random()
    .toString(36)
    .substring(2, 2 + length);
}

export function generateId(prefix: string, length = 8): string {
  return `${prefix}_${Date.now()}_${randomSuffix(length)}`;
}
