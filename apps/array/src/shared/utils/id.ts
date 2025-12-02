export function randomSuffix(length = 8): string {
  const array = new Uint8Array(length);
  crypto.getRandomValues(array);
  return Array.from(array, (b) => b.toString(16).padStart(2, "0"))
    .join("")
    .substring(0, length);
}

export function generateId(prefix: string, length = 8): string {
  return `${prefix}_${Date.now()}_${randomSuffix(length)}`;
}
