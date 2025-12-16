/**
 * Main process DI tokens.
 *
 * IMPORTANT: These tokens are for main process only.
 * Never import this file from renderer code.
 */
export const MAIN_TOKENS = Object.freeze({
  // Services
  GitService: Symbol.for("Main.GitService"),
  DeepLinkService: Symbol.for("Main.DeepLinkService"),
  OAuthService: Symbol.for("Main.OAuthService"),
  TaskLinkService: Symbol.for("Main.TaskLinkService"),
});
