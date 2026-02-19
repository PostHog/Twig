export const SHORTCUTS = {
  COMMAND_MENU: "mod+k",
  NEW_TASK: "mod+n,mod+t",
  SETTINGS: "mod+,",
  SHORTCUTS_SHEET: "mod+/",
  GO_BACK: "mod+[",
  GO_FORWARD: "mod+]",
  TOGGLE_LEFT_SIDEBAR: "mod+b",
  TOGGLE_RIGHT_SIDEBAR: "mod+shift+b",
  PREV_TASK: "mod+shift+[,ctrl+shift+tab",
  NEXT_TASK: "mod+shift+],ctrl+tab",
  SAVE_FILE: "mod+s",
  CLOSE_TAB: "mod+w",
  SWITCH_TAB: "ctrl+1,ctrl+2,ctrl+3,ctrl+4,ctrl+5,ctrl+6,ctrl+7,ctrl+8,ctrl+9",
  SWITCH_TASK: "mod+0,mod+1,mod+2,mod+3,mod+4,mod+5,mod+6,mod+7,mod+8,mod+9",
  OPEN_IN_EDITOR: "mod+o",
  COPY_PATH: "mod+shift+c",
  TOGGLE_FOCUS: "mod+r",
  BLUR: "escape",
  SUBMIT_BLUR: "mod+enter",
} as const;

export type ShortcutCategory = "general" | "navigation" | "panels" | "editor";

export interface KeyboardShortcut {
  id: string;
  keys: string;
  description: string;
  category: ShortcutCategory;
  context?: string;
  alternateKeys?: string;
}

export const KEYBOARD_SHORTCUTS: KeyboardShortcut[] = [
  {
    id: "new-task",
    keys: "mod+n",
    description: "New task",
    category: "general",
    alternateKeys: "mod+t",
  },
  {
    id: "command-menu",
    keys: SHORTCUTS.COMMAND_MENU,
    description: "Open command menu",
    category: "general",
  },
  {
    id: "toggle-focus",
    keys: SHORTCUTS.TOGGLE_FOCUS,
    description: "Toggle focus mode",
    category: "general",
    context: "Worktree task",
  },
  {
    id: "settings",
    keys: SHORTCUTS.SETTINGS,
    description: "Open settings",
    category: "general",
  },
  {
    id: "shortcuts",
    keys: SHORTCUTS.SHORTCUTS_SHEET,
    description: "Show keyboard shortcuts",
    category: "general",
  },
  {
    id: "switch-task",
    keys: "mod+0-9",
    description: "Switch to task 1-9 (0 = home)",
    category: "navigation",
  },
  {
    id: "prev-task",
    keys: "mod+shift+[",
    description: "Previous task",
    category: "navigation",
    alternateKeys: "ctrl+shift+tab",
  },
  {
    id: "next-task",
    keys: "mod+shift+]",
    description: "Next task",
    category: "navigation",
    alternateKeys: "ctrl+tab",
  },
  {
    id: "go-back",
    keys: SHORTCUTS.GO_BACK,
    description: "Go back",
    category: "navigation",
  },
  {
    id: "go-forward",
    keys: SHORTCUTS.GO_FORWARD,
    description: "Go forward",
    category: "navigation",
  },
  {
    id: "toggle-left-sidebar",
    keys: SHORTCUTS.TOGGLE_LEFT_SIDEBAR,
    description: "Toggle left sidebar",
    category: "navigation",
  },
  {
    id: "toggle-right-sidebar",
    keys: SHORTCUTS.TOGGLE_RIGHT_SIDEBAR,
    description: "Toggle right sidebar",
    category: "navigation",
  },
  {
    id: "switch-tab",
    keys: "ctrl+1-9",
    description: "Switch to tab 1-9",
    category: "panels",
    context: "Task detail",
  },
  {
    id: "save-file",
    keys: SHORTCUTS.SAVE_FILE,
    description: "Save file",
    category: "panels",
    context: "File editor",
  },
  {
    id: "close-tab",
    keys: SHORTCUTS.CLOSE_TAB,
    description: "Close active tab",
    category: "panels",
    context: "Task detail",
  },
  {
    id: "open-in-editor",
    keys: SHORTCUTS.OPEN_IN_EDITOR,
    description: "Open in external editor",
    category: "panels",
    context: "Task detail",
  },
  {
    id: "copy-path",
    keys: SHORTCUTS.COPY_PATH,
    description: "Copy file path",
    category: "panels",
    context: "Task detail",
  },
  {
    id: "editor-bold",
    keys: "mod+b",
    description: "Bold",
    category: "editor",
    context: "Rich text editor",
  },
  {
    id: "editor-italic",
    keys: "mod+i",
    description: "Italic",
    category: "editor",
    context: "Rich text editor",
  },
  {
    id: "editor-underline",
    keys: "mod+u",
    description: "Underline",
    category: "editor",
    context: "Rich text editor",
  },
  {
    id: "editor-code",
    keys: "mod+e",
    description: "Inline code",
    category: "editor",
    context: "Rich text editor",
  },
];

export const CATEGORY_LABELS: Record<ShortcutCategory, string> = {
  general: "General",
  navigation: "Navigation",
  panels: "Panels & Tabs",
  editor: "Editor",
};

export function getShortcutsByCategory(): Record<
  ShortcutCategory,
  KeyboardShortcut[]
> {
  const grouped: Record<ShortcutCategory, KeyboardShortcut[]> = {
    general: [],
    navigation: [],
    panels: [],
    editor: [],
  };
  for (const shortcut of KEYBOARD_SHORTCUTS) {
    grouped[shortcut.category].push(shortcut);
  }
  return grouped;
}

export function formatHotkey(keys: string): string {
  const isMac =
    typeof navigator !== "undefined" && /Mac/.test(navigator.platform);

  // Get only the first hotkey if multiple are defined (e.g., "mod+1,mod+2,mod+3")
  // But handle edge case where comma is the actual key (e.g., "mod+,")
  let hotkey = keys;
  if (keys.includes(",") && !keys.endsWith(",")) {
    hotkey = keys.split(",")[0];
  }

  return hotkey
    .split("+")
    .map((key) => {
      const k = key.trim().toLowerCase();
      if (k === "mod") return isMac ? "⌘" : "Ctrl";
      if (k === "shift") return isMac ? "⇧" : "Shift";
      if (k === "alt") return isMac ? "⌥" : "Alt";
      if (k === "ctrl") return isMac ? "⌃" : "Ctrl";
      if (k === "enter") return isMac ? "↩" : "Enter";
      if (k === "escape" || k === "esc") return "Esc";
      if (k === "up" || k === "arrowup") return "↑";
      if (k === "down" || k === "arrowdown") return "↓";
      if (k === ",") return ",";
      if (k === "[") return "[";
      if (k === "]") return "]";
      if (k === "tab") return "Tab";
      return k.toUpperCase();
    })
    .join(isMac ? "" : "+");
}
