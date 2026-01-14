import type { CommandMeta } from "@array/core/commands/types";
import { isRepoInitialized } from "@array/core/config";
import { hasBranch } from "@array/core/git/branch";
import { hasRemote, isBranchPushed, pushBranch } from "@array/core/git/remote";
import { hasGitCommits, initGit, isInGitRepo } from "@array/core/git/repo";
import { detectTrunkBranches } from "@array/core/git/trunk";
import {
  checkPrerequisites,
  configureTrunk,
  initJj,
  installJj,
  isJjInitialized,
} from "@array/core/init";
import { COMMANDS } from "../registry";
import {
  arr,
  blank,
  bold,
  cyan,
  dim,
  formatError,
  hint,
  message,
  status,
  steps,
  success,
  warning,
} from "../utils/output";
import { confirm, select } from "../utils/prompt";

export const meta: CommandMeta = {
  name: "init",
  description:
    "Initialize Array in this repository by selecting a trunk branch",
  context: "none",
  category: "setup",
};

function printBanner(): void {
  blank();
  message(`${bold("Array")} ${dim("- Stacked PRs for jj")}`);
  blank();
}

function printQuickStart(): void {
  const commands: [cmd: string, desc: string, args?: string][] = [
    [`arr ${COMMANDS.create.name}`, "Create a change", '"my first change"'],
    [`arr ${COMMANDS.log.name}`, "See your stack"],
    [`arr ${COMMANDS.submit.name}`, "Create a PR"],
  ];

  // Calculate max width for alignment
  const maxWidth = Math.max(
    ...commands.map(([cmd, , args]) => {
      const full = args ? `${cmd} ${args}` : cmd;
      return full.length;
    }),
  );

  blank();
  message(cyan("You're ready to go!"));
  blank();
  message(dim("Quick start:"));
  for (const [cmd, desc, args] of commands) {
    const full = args ? `${cmd} ${dim(args)}` : cmd;
    const displayLen = args ? `${cmd} ${args}`.length : cmd.length;
    const padding = " ".repeat(maxWidth - displayLen + 2);
    message(`  ${cyan(full)}${padding}${desc}`);
  }
  blank();
}

export async function init(
  flags: Record<string, string | boolean> = {},
): Promise<void> {
  const cwd = process.cwd();
  const autoYes = Boolean(flags.y || flags.yes);

  printBanner();

  const alreadyInitialized = await isRepoInitialized(cwd);
  if (alreadyInitialized) {
    warning("Array is already initialized in this repo.");
    hint(`Run \`${arr(COMMANDS.status)}\` to see your current state.`);
    return;
  }

  const prereqs = await checkPrerequisites();

  if (!prereqs.git.found) {
    console.error(formatError("git not found"));
    steps("Please install git first:", ["brew install git"]);
    process.exit(1);
  }

  if (!prereqs.jj.found) {
    const installChoice = await select("jj is required. Install now?", [
      { label: "Yes, install via Homebrew", value: "brew" as const },
      { label: "Yes, install via Cargo", value: "cargo" as const },
      { label: "No, I'll install it myself", value: "skip" as const },
    ]);

    if (installChoice === "skip" || installChoice === null) {
      steps(
        "Install jj manually:",
        ["brew install jj (Homebrew)", "cargo install jj-cli (Cargo)"],
        COMMANDS.init,
      );
      process.exit(1);
    }

    status("Installing jj...");
    const installResult = await installJj(installChoice);
    if (!installResult.ok) {
      console.error(formatError(installResult.error.message));
      process.exit(1);
    }
    success("jj installed");
    blank();
  }

  let inGitRepo = await isInGitRepo(cwd);
  if (!inGitRepo) {
    const shouldInitGit = await confirm("Initialize git here?", { autoYes });
    if (shouldInitGit === null) {
      message(dim("Cancelled."));
      process.exit(1);
    }
    if (!shouldInitGit) {
      steps("Initialize git manually:", ["git init"], COMMANDS.init);
      process.exit(1);
    }

    const gitResult = await initGit(cwd);
    if (!gitResult.ok) {
      console.error(formatError(gitResult.error.message));
      process.exit(1);
    }
    success("Initialized git repository");
    inGitRepo = true;
  }

  const hasCommits = await hasGitCommits(cwd);
  if (!hasCommits) {
    console.error(formatError("No commits found in this repository."));
    steps(
      "Create your first commit before initializing Array:",
      ["git add .", 'git commit -m "Initial commit"'],
      COMMANDS.init,
    );
    process.exit(1);
  }

  const trunkCandidates = await detectTrunkBranches(cwd);
  let trunk: string;

  if (trunkCandidates.length === 1) {
    trunk = trunkCandidates[0];
    // Verify the branch actually exists
    const exists = await hasBranch(cwd, trunk);
    if (!exists) {
      console.error(formatError(`Branch '${trunk}' not found.`));
      steps(
        "Create your first commit on a branch:",
        ["git checkout -b main", "git add .", 'git commit -m "Initial commit"'],
        COMMANDS.init,
      );
      process.exit(1);
    }
  } else {
    const selected = await select(
      "Select your trunk branch:",
      trunkCandidates.map((b) => ({ label: b, value: b })),
    );
    if (!selected) {
      message(dim("Cancelled."));
      process.exit(1);
    }
    trunk = selected;
  }

  const jjInitialized = await isJjInitialized(cwd);
  if (!jjInitialized) {
    const shouldInit = await confirm("Initialize jj in this repo?", {
      autoYes,
    });
    if (shouldInit === null) {
      message(dim("Cancelled."));
      process.exit(1);
    }
    if (!shouldInit) {
      steps(
        "Initialize jj manually:",
        ["jj git init --colocate"],
        COMMANDS.init,
      );
      process.exit(1);
    }

    const initResult = await initJj(cwd);
    if (!initResult.ok) {
      console.error(formatError(initResult.error.message));
      process.exit(1);
    }
    success("Initialized jj");
  }

  // Configure jj's trunk() alias to point to the selected trunk branch
  const trunkResult = await configureTrunk(cwd, trunk);
  if (!trunkResult.ok) {
    console.error(formatError(trunkResult.error.message));
    process.exit(1);
  }

  // Ensure trunk is pushed to remote (required for PR creation)
  const remoteExists = await hasRemote(cwd);
  if (remoteExists) {
    const trunkPushed = await isBranchPushed(cwd, trunk);
    if (!trunkPushed) {
      const pushResult = await pushBranch(cwd, trunk);
      if (!pushResult.ok) {
        warning(`Could not push ${trunk} to remote.`);
        hint(`PRs require ${trunk} to exist on the remote.`);
        hint(`Run: git push -u origin ${trunk}`);
      }
    }
  }

  printQuickStart();
}
