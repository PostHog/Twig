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
  FileWatcherService: Symbol.for("Main.FileWatcherService"),
  FoldersService: Symbol.for("Main.FoldersService"),
  FsService: Symbol.for("Main.FsService"),
  GitService: Symbol.for("Main.GitService"),
  OAuthService: Symbol.for("Main.OAuthService"),
  ShellService: Symbol.for("Main.ShellService"),
  UpdatesService: Symbol.for("Main.UpdatesService"),
});
