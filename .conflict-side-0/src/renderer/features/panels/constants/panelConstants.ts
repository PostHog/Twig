export const PANEL_SIZES = {
  MIN_PANEL_SIZE: 15,
  DEFAULT_SPLIT: [70, 30] as const,
  EVEN_SPLIT: [50, 50] as const,
  SIZE_DIFF_THRESHOLD: 0.1,
} as const;

export const UI_SIZES = {
  TAB_HEIGHT: 40,
  TAB_LABEL_MAX_WIDTH: 200,
  DROP_ZONE_SIZE: "20%",
} as const;

export const DEFAULT_PANEL_IDS = {
  ROOT: "root",
  MAIN_PANEL: "main-panel",
  RIGHT_GROUP: "right-group",
  DETAILS_PANEL: "details-panel",
  FILES_PANEL: "files-panel",
} as const;

export const DEFAULT_TAB_IDS = {
  LOGS: "logs",
  SHELL: "shell",
  DETAILS: "details",
  FILES: "files",
  TODO_LIST: "todo-list",
  ARTIFACTS: "artifacts",
} as const;
