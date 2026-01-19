import type { BrowserWindow } from "electron";

let mainWindowGetter: (() => BrowserWindow | null) | null = null;

export function setMainWindowGetter(getter: () => BrowserWindow | null): void {
  mainWindowGetter = getter;
}

export function getMainWindow(): BrowserWindow | null {
  return mainWindowGetter?.() ?? null;
}
