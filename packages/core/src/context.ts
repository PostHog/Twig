import { isRepoInitialized } from "./config";
import { isInGitRepo } from "./git/repo";
import { checkPrerequisites, isJjInitialized } from "./init";

export type ContextLevel = "none" | "jj" | "array";

export interface Context {
  inGitRepo: boolean;
  jjInstalled: boolean;
  jjInitialized: boolean;
  arrayInitialized: boolean;
}

export async function checkContext(cwd: string): Promise<Context> {
  const prereqs = await checkPrerequisites();
  const inGitRepo = await isInGitRepo(cwd);
  const jjInitialized = inGitRepo ? await isJjInitialized(cwd) : false;
  const arrayInitialized = inGitRepo ? await isRepoInitialized(cwd) : false;

  return {
    inGitRepo,
    jjInstalled: prereqs.jj.found,
    jjInitialized,
    arrayInitialized,
  };
}

export function isContextValid(context: Context, level: ContextLevel): boolean {
  if (level === "none") return true;

  const jjReady =
    context.jjInstalled && context.inGitRepo && context.jjInitialized;
  if (level === "jj") return jjReady;

  return jjReady && context.arrayInitialized;
}
