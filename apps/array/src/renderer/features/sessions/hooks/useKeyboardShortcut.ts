import { useEffect } from "react";

interface Options {
  enabled?: boolean;
}

export function useKeyboardShortcut(
  key: string,
  callback: () => void,
  options: Options = {},
): void {
  const { enabled = true } = options;

  useEffect(() => {
    if (!enabled) return;

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === key) {
        callback();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [key, callback, enabled]);
}
