/**
 * Main process DI tokens.
 *
 * IMPORTANT: These tokens are for main process only.
 * Never import this file from renderer code.
 */
export const MAIN_TOKENS = Object.freeze({
  // Services
  ContextMenuService: Symbol.for("Main.ContextMenuService"),
  DockBadgeService: Symbol.for("Main.DockBadgeService"),
  ExternalAppsService: Symbol.for("Main.ExternalAppsService"),
  GitService: Symbol.for("Main.GitService"),
});
