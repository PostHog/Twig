import { exec, execFile } from "node:child_process";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { promisify } from "node:util";
import type { WorktreeInfo } from "./types.js";
import { Logger } from "./utils/logger.js";

const execAsync = promisify(exec);
const execFileAsync = promisify(execFile);

export interface WorktreeConfig {
  mainRepoPath: string;
  logger?: Logger;
}

const ADJECTIVES = [
  "swift",
  "bright",
  "calm",
  "bold",
  "gentle",
  "quick",
  "soft",
  "warm",
  "cool",
  "wise",
  "keen",
  "brave",
  "clear",
  "crisp",
  "deep",
  "fair",
  "fine",
  "free",
  "glad",
  "good",
  "grand",
  "great",
  "happy",
  "kind",
  "light",
  "lively",
  "neat",
  "nice",
  "plain",
  "proud",
  "pure",
  "rare",
  "rich",
  "safe",
  "sharp",
  "shy",
  "simple",
  "slim",
  "smart",
  "smooth",
  "solid",
  "sound",
  "spare",
  "stable",
  "steady",
  "still",
  "strong",
  "sure",
  "sweet",
  "tall",
  "agile",
  "ancient",
  "autumn",
  "azure",
  "cosmic",
  "daring",
  "dawn",
  "dusty",
  "eager",
  "early",
  "endless",
  "fading",
  "fallen",
  "famous",
  "feral",
  "fierce",
  "fleet",
  "foggy",
  "forest",
  "frozen",
  "gleeful",
  "golden",
  "hazy",
  "hidden",
  "hollow",
  "humble",
  "hushed",
  "icy",
  "inner",
  "late",
  "lazy",
  "little",
  "lone",
  "long",
  "lost",
  "lucky",
  "lunar",
  "magic",
  "mellow",
  "mighty",
  "misty",
  "modest",
  "mossy",
  "mystic",
  "nimble",
  "noble",
  "ocean",
  "outer",
  "pale",
  "paper",
  "patient",
  "peaceful",
  "phantom",
  "polite",
  "primal",
  "quiet",
  "rapid",
  "restless",
  "rising",
  "roaming",
  "rocky",
  "rustic",
  "sacred",
  "sandy",
  "secret",
  "serene",
  "shadow",
  "shining",
  "silent",
  "silky",
  "silver",
  "sleek",
  "snowy",
  "solar",
  "solemn",
  "spring",
  "starry",
  "stormy",
  "summer",
  "sunny",
  "tender",
  "thorny",
  "tiny",
  "tranquil",
  "twilight",
  "upward",
  "velvet",
  "vivid",
  "wandering",
  "wary",
  "wild",
  "windy",
  "winter",
  "wispy",
  "young",
];

const COLORS = [
  "blue",
  "red",
  "green",
  "amber",
  "coral",
  "jade",
  "pearl",
  "ruby",
  "sage",
  "teal",
  "gold",
  "silver",
  "bronze",
  "copper",
  "ivory",
  "onyx",
  "opal",
  "rose",
  "slate",
  "violet",
  "aqua",
  "azure",
  "beige",
  "black",
  "brass",
  "brick",
  "brown",
  "cedar",
  "charcoal",
  "cherry",
  "chestnut",
  "chrome",
  "cider",
  "cinnamon",
  "citrus",
  "clay",
  "cloud",
  "cobalt",
  "cocoa",
  "cream",
  "crimson",
  "crystal",
  "cyan",
  "denim",
  "dusk",
  "ebony",
  "ember",
  "emerald",
  "fern",
  "flame",
  "flint",
  "forest",
  "frost",
  "garnet",
  "ginger",
  "glacier",
  "granite",
  "grape",
  "gray",
  "hazel",
  "honey",
  "indigo",
  "iron",
  "lapis",
  "lava",
  "lavender",
  "lemon",
  "lilac",
  "lime",
  "magenta",
  "mahogany",
  "maple",
  "marble",
  "maroon",
  "mauve",
  "midnight",
  "mint",
  "mocha",
  "moss",
  "mustard",
  "navy",
  "nickel",
  "obsidian",
  "ochre",
  "olive",
  "orange",
  "orchid",
  "peach",
  "pine",
  "pink",
  "plum",
  "porcelain",
  "purple",
  "quartz",
  "rust",
  "saffron",
  "salmon",
  "sand",
  "sapphire",
  "scarlet",
  "sepia",
  "shadow",
  "sienna",
  "smoke",
  "snow",
  "steel",
  "stone",
  "storm",
  "sunset",
  "tan",
  "tangerine",
  "taupe",
  "terra",
  "timber",
  "topaz",
  "turquoise",
  "umber",
  "vanilla",
  "walnut",
  "wheat",
  "white",
  "wine",
  "yellow",
];

const ANIMALS = [
  "fox",
  "owl",
  "bear",
  "wolf",
  "hawk",
  "deer",
  "lynx",
  "otter",
  "raven",
  "falcon",
  "badger",
  "beaver",
  "bison",
  "bobcat",
  "crane",
  "eagle",
  "ferret",
  "finch",
  "gopher",
  "heron",
  "jaguar",
  "koala",
  "lemur",
  "marten",
  "mink",
  "moose",
  "newt",
  "ocelot",
  "osprey",
  "panda",
  "parrot",
  "pelican",
  "puma",
  "quail",
  "rabbit",
  "raccoon",
  "salmon",
  "seal",
  "shark",
  "shrew",
  "sloth",
  "snake",
  "spider",
  "squid",
  "stork",
  "swan",
  "tiger",
  "toucan",
  "turtle",
  "whale",
  "albatross",
  "ant",
  "antelope",
  "armadillo",
  "baboon",
  "bat",
  "bee",
  "beetle",
  "buffalo",
  "butterfly",
  "camel",
  "cardinal",
  "caribou",
  "catfish",
  "cheetah",
  "chipmunk",
  "cicada",
  "clam",
  "cobra",
  "condor",
  "corgi",
  "cougar",
  "coyote",
  "crab",
  "cricket",
  "crow",
  "dolphin",
  "donkey",
  "dove",
  "dragonfly",
  "duck",
  "eel",
  "egret",
  "elephant",
  "elk",
  "emu",
  "firefly",
  "flamingo",
  "frog",
  "gazelle",
  "gecko",
  "gibbon",
  "giraffe",
  "goat",
  "goose",
  "gorilla",
  "grasshopper",
  "grouse",
  "gull",
  "hamster",
  "hare",
  "hedgehog",
  "hippo",
  "hornet",
  "horse",
  "hound",
  "hummingbird",
  "hyena",
  "ibis",
  "iguana",
  "impala",
  "jackal",
  "jay",
  "jellyfish",
  "kangaroo",
  "kestrel",
  "kingfisher",
  "kite",
  "kiwi",
  "lark",
  "leopard",
  "lion",
  "lizard",
  "llama",
  "lobster",
  "loon",
  "macaw",
  "magpie",
  "mallard",
  "mammoth",
  "manatee",
  "mantis",
  "marlin",
  "marmot",
  "meerkat",
  "mockingbird",
  "mole",
  "mongoose",
  "monkey",
  "moth",
  "mouse",
  "mule",
  "narwhal",
  "nightingale",
  "octopus",
  "opossum",
  "orangutan",
  "oriole",
  "ostrich",
  "oyster",
  "panther",
  "peacock",
  "penguin",
  "pheasant",
  "pig",
  "pigeon",
  "pike",
  "piranha",
  "platypus",
  "pony",
  "porcupine",
  "porpoise",
  "python",
  "raven",
  "ray",
  "reindeer",
  "rhino",
  "robin",
  "rooster",
  "salamander",
  "sandpiper",
  "sardine",
  "scorpion",
  "seagull",
  "seahorse",
  "skunk",
  "snail",
  "sparrow",
  "squirrel",
  "starfish",
  "starling",
  "stingray",
  "swallow",
  "tapir",
  "termite",
  "tern",
  "toad",
  "trout",
  "tuna",
  "viper",
  "vulture",
  "walrus",
  "wasp",
  "weasel",
  "wombat",
  "woodpecker",
  "wren",
  "yak",
  "zebra",
];

const WORKTREE_FOLDER_NAME = ".array";

export class WorktreeManager {
  private mainRepoPath: string;
  private logger: Logger;

  constructor(config: WorktreeConfig) {
    this.mainRepoPath = config.mainRepoPath;
    this.logger =
      config.logger ||
      new Logger({ debug: false, prefix: "[WorktreeManager]" });
  }

  private async runGitCommand(command: string): Promise<string> {
    try {
      const { stdout } = await execAsync(`git ${command}`, {
        cwd: this.mainRepoPath,
      });
      return stdout.trim();
    } catch (error) {
      throw new Error(`Git command failed: ${command}\n${error}`);
    }
  }

  private randomElement<T>(array: T[]): T {
    return array[Math.floor(Math.random() * array.length)];
  }

  generateWorktreeName(): string {
    const adjective = this.randomElement(ADJECTIVES);
    const color = this.randomElement(COLORS);
    const animal = this.randomElement(ANIMALS);
    return `${adjective}-${color}-${animal}`;
  }

  private getWorktreeFolderPath(): string {
    return path.join(this.mainRepoPath, WORKTREE_FOLDER_NAME);
  }

  private getWorktreePath(name: string): string {
    return path.join(this.getWorktreeFolderPath(), name);
  }

  async worktreeExists(name: string): Promise<boolean> {
    const worktreePath = this.getWorktreePath(name);
    try {
      await fs.access(worktreePath);
      return true;
    } catch {
      return false;
    }
  }

  async ensureArrayDirIgnored(): Promise<void> {
    // Use .git/info/exclude instead of .gitignore to avoid modifying tracked files
    const excludePath = path.join(this.mainRepoPath, ".git", "info", "exclude");
    const ignorePattern = `/${WORKTREE_FOLDER_NAME}/`;

    let content = "";
    try {
      content = await fs.readFile(excludePath, "utf-8");
    } catch {
      // File doesn't exist or .git/info doesn't exist
    }

    // Check if pattern is already present
    if (
      content.includes(`/${WORKTREE_FOLDER_NAME}/`) ||
      content.includes(`/${WORKTREE_FOLDER_NAME}`)
    ) {
      this.logger.debug("Exclude file already contains .array folder pattern");
      return;
    }

    // Ensure .git/info directory exists
    const infoDir = path.join(this.mainRepoPath, ".git", "info");
    await fs.mkdir(infoDir, { recursive: true });

    // Append the pattern
    const newContent = `${content.trimEnd()}\n\n# Array worktrees\n${ignorePattern}\n`;
    await fs.writeFile(excludePath, newContent);
    this.logger.info("Added .array folder to .git/info/exclude");
  }

  private async generateUniqueWorktreeName(): Promise<string> {
    let name = this.generateWorktreeName();
    let attempts = 0;
    const maxAttempts = 100;

    while ((await this.worktreeExists(name)) && attempts < maxAttempts) {
      name = this.generateWorktreeName();
      attempts++;
    }

    if (attempts >= maxAttempts) {
      // Fallback: append timestamp
      name = `${this.generateWorktreeName()}-${Date.now()}`;
    }

    return name;
  }

  private async getDefaultBranch(): Promise<string> {
    try {
      const remoteBranch = await this.runGitCommand(
        "symbolic-ref refs/remotes/origin/HEAD",
      );
      return remoteBranch.replace("refs/remotes/origin/", "");
    } catch {
      // Fallback: check if main exists, otherwise use master
      try {
        await this.runGitCommand("rev-parse --verify main");
        return "main";
      } catch {
        try {
          await this.runGitCommand("rev-parse --verify master");
          return "master";
        } catch {
          throw new Error(
            "Cannot determine default branch. No main or master branch found.",
          );
        }
      }
    }
  }

  async createWorktree(): Promise<WorktreeInfo> {
    // Ensure the .array folder is ignored
    await this.ensureArrayDirIgnored();

    // Generate unique worktree name
    const worktreeName = await this.generateUniqueWorktreeName();
    const worktreePath = this.getWorktreePath(worktreeName);
    const branchName = `posthog/${worktreeName}`;
    const baseBranch = await this.getDefaultBranch();

    this.logger.info("Creating worktree", {
      worktreeName,
      worktreePath,
      branchName,
      baseBranch,
    });

    // Create the worktree with a new branch
    // Using relative path from repo root for git worktree command
    const relativePath = `${WORKTREE_FOLDER_NAME}/${worktreeName}`;
    await this.runGitCommand(
      `worktree add -b "${branchName}" "./${relativePath}" "${baseBranch}"`,
    );

    const createdAt = new Date().toISOString();

    this.logger.info("Worktree created successfully", {
      worktreeName,
      worktreePath,
      branchName,
    });

    return {
      worktreePath,
      worktreeName,
      branchName,
      baseBranch,
      createdAt,
    };
  }

  async deleteWorktree(worktreePath: string): Promise<void> {
    this.logger.info("Deleting worktree", { worktreePath });

    try {
      // First, try to remove the worktree via git using execFileAsync for safety
      await execFileAsync(
        "git",
        ["worktree", "remove", worktreePath, "--force"],
        {
          cwd: this.mainRepoPath,
        },
      );
      this.logger.info("Worktree deleted successfully", { worktreePath });
    } catch (error) {
      this.logger.warn(
        "Git worktree remove failed, attempting manual cleanup",
        {
          worktreePath,
          error,
        },
      );

      // Manual cleanup if git command fails
      try {
        await fs.rm(worktreePath, { recursive: true, force: true });
        // Also prune the worktree list
        await this.runGitCommand("worktree prune");
        this.logger.info("Worktree cleaned up manually", { worktreePath });
      } catch (cleanupError) {
        this.logger.error("Failed to cleanup worktree", {
          worktreePath,
          cleanupError,
        });
        throw cleanupError;
      }
    }
  }

  async getWorktreeInfo(worktreePath: string): Promise<WorktreeInfo | null> {
    try {
      // Parse the worktree list to find info about this worktree
      const output = await this.runGitCommand("worktree list --porcelain");
      const worktrees = this.parseWorktreeList(output);

      const worktree = worktrees.find((w) => w.worktreePath === worktreePath);
      return worktree || null;
    } catch (error) {
      this.logger.debug("Failed to get worktree info", { worktreePath, error });
      return null;
    }
  }

  async listWorktrees(): Promise<WorktreeInfo[]> {
    try {
      const output = await this.runGitCommand("worktree list --porcelain");
      return this.parseWorktreeList(output);
    } catch (error) {
      this.logger.debug("Failed to list worktrees", { error });
      return [];
    }
  }

  private parseWorktreeList(output: string): WorktreeInfo[] {
    const worktrees: WorktreeInfo[] = [];
    const entries = output.split("\n\n").filter((e) => e.trim());

    for (const entry of entries) {
      const lines = entry.split("\n");
      let worktreePath = "";
      let branchName = "";

      for (const line of lines) {
        if (line.startsWith("worktree ")) {
          worktreePath = line.replace("worktree ", "");
        } else if (line.startsWith("branch refs/heads/")) {
          branchName = line.replace("branch refs/heads/", "");
        }
      }

      // Only include worktrees in our .array folder
      if (worktreePath?.includes(`/${WORKTREE_FOLDER_NAME}/`) && branchName) {
        const worktreeName = path.basename(worktreePath);
        worktrees.push({
          worktreePath,
          worktreeName,
          branchName,
          baseBranch: "", // We don't store this in git, would need to track separately
          createdAt: "", // We don't store this in git, would need to track separately
        });
      }
    }

    return worktrees;
  }

  async isWorktree(repoPath: string): Promise<boolean> {
    try {
      const { stdout } = await execAsync(
        "git rev-parse --is-inside-work-tree",
        { cwd: repoPath },
      );
      if (stdout.trim() !== "true") {
        return false;
      }

      // Check if there's a .git file (worktrees have a .git file, not a .git directory)
      const gitPath = path.join(repoPath, ".git");
      const stat = await fs.stat(gitPath);
      return stat.isFile(); // Worktrees have .git as a file, main repos have .git as a directory
    } catch {
      return false;
    }
  }

  async getMainRepoPathFromWorktree(
    worktreePath: string,
  ): Promise<string | null> {
    try {
      const gitFilePath = path.join(worktreePath, ".git");
      const content = await fs.readFile(gitFilePath, "utf-8");

      // The .git file in a worktree contains: gitdir: /path/to/main/.git/worktrees/name
      const match = content.match(/gitdir:\s*(.+)/);
      if (match) {
        const gitDir = match[1].trim();
        // Go up from .git/worktrees/name to get the main repo path
        // The gitdir points to something like: /main/repo/.git/worktrees/worktree-name
        const mainGitDir = path.resolve(gitDir, "..", "..", "..");
        return mainGitDir;
      }
      return null;
    } catch {
      return null;
    }
  }

  async cleanupOrphanedWorktrees(associatedWorktreePaths: string[]): Promise<{
    deleted: string[];
    errors: Array<{ path: string; error: string }>;
  }> {
    this.logger.info("Starting cleanup of orphaned worktrees");

    const allWorktrees = await this.listWorktrees();
    const deleted: string[] = [];
    const errors: Array<{ path: string; error: string }> = [];

    const associatedPathsSet = new Set(
      associatedWorktreePaths.map((p) => path.resolve(p)),
    );

    for (const worktree of allWorktrees) {
      const resolvedPath = path.resolve(worktree.worktreePath);

      if (!associatedPathsSet.has(resolvedPath)) {
        this.logger.info("Found orphaned worktree", {
          path: worktree.worktreePath,
        });

        try {
          await this.deleteWorktree(worktree.worktreePath);
          deleted.push(worktree.worktreePath);
          this.logger.info("Deleted orphaned worktree", {
            path: worktree.worktreePath,
          });
        } catch (error) {
          const errorMessage =
            error instanceof Error ? error.message : String(error);
          errors.push({
            path: worktree.worktreePath,
            error: errorMessage,
          });
          this.logger.error("Failed to delete orphaned worktree", {
            path: worktree.worktreePath,
            error: errorMessage,
          });
        }
      }
    }

    this.logger.info("Cleanup completed", {
      deleted: deleted.length,
      errors: errors.length,
    });

    return { deleted, errors };
  }
}
