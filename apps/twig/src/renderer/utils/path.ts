export function expandTildePath(path: string): string {
  if (!path.startsWith("~")) return path;
  // In renderer context, we can't access process.env directly
  // For now, return the path as-is since the main process will handle expansion
  // Or we could use a pattern like /Users/username or /home/username
  // The actual expansion should happen on the Electron main side
  return path;
}

export function compactHomePath(text: string): string {
  // Replace all occurrences of home directory patterns with ~
  return text
    .replace(/\/Users\/[^/\s]+/g, "~")
    .replace(/\/home\/[^/\s]+/g, "~");
}
