import {
  checkGhAuth,
  ghAuthLogin,
  isGhInstalled,
  saveAuthState,
} from "@twig/core/auth";
import type { CommandMeta } from "@twig/core/commands/types";
import { COMMANDS } from "../registry";
import {
  arr,
  blank,
  bold,
  cmd,
  cyan,
  dim,
  formatError,
  formatSuccess,
  heading,
  hint,
  indent,
  message,
  status,
  steps,
} from "../utils/output";
import { select } from "../utils/prompt";

export const meta: CommandMeta = {
  name: "auth",
  description: "Authenticate with GitHub for PR management",
  context: "none",
  category: "setup",
};

export async function auth(): Promise<void> {
  heading("GitHub Authentication");

  const ghInstalled = await isGhInstalled();
  if (!ghInstalled) {
    message(formatError("GitHub CLI (gh) is required but not installed."));
    steps("Install via Homebrew:", ["brew install gh"], COMMANDS.auth);
    process.exit(1);
  }

  const authStatus = await checkGhAuth();

  if (authStatus.authenticated) {
    message(
      formatSuccess(
        `Already authenticated as ${cyan(`@${authStatus.username}`)}`,
      ),
    );
    blank();
    hint(`To re-authenticate, run: ${cmd("gh auth login")}`);
    return;
  }

  message("To submit PRs, Twig needs access to GitHub.");
  blank();

  const method = await select("Authenticate via:", [
    { label: "Browser (recommended)", value: "browser" as const },
    { label: "Token", value: "token" as const },
  ]);

  if (!method) {
    message(dim("Cancelled."));
    return;
  }

  blank();

  if (method === "browser") {
    status("Opening browser...");
    const result = await ghAuthLogin();

    if (!result.ok) {
      console.error(formatError(result.error.message));
      process.exit(1);
    }

    blank();
    message(formatSuccess(`Authenticated as ${cyan(`@${result.value}`)}`));

    await saveAuthState({
      version: 1,
      ghAuthenticated: true,
      username: result.value,
    });
  } else {
    indent(`1. Go to ${cyan("https://github.com/settings/tokens")}`);
    indent(`2. Create a token with ${bold("repo")} scope`);
    indent(`3. Run: ${cmd("gh auth login --with-token")}`);
    blank();
    hint(`Then run ${arr(COMMANDS.auth)} again to verify.`);
  }
}
