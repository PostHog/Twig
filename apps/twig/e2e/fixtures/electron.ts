import { existsSync } from "node:fs";
import path from "node:path";
import {
  test as base,
  type ElectronApplication,
  _electron as electron,
  type Page,
} from "@playwright/test";

function getAppPath(): string {
  const outDir = path.join(__dirname, "../../out");

  if (process.platform === "darwin") {
    const arm64Path = path.join(
      outDir,
      "Twig-darwin-arm64/Twig.app/Contents/MacOS/Twig",
    );
    const x64Path = path.join(
      outDir,
      "Twig-darwin-x64/Twig.app/Contents/MacOS/Twig",
    );

    if (existsSync(arm64Path)) return arm64Path;
    if (existsSync(x64Path)) return x64Path;

    throw new Error(
      `No packaged app found in ${outDir}. Run 'pnpm --filter twig package' first.`,
    );
  }

  if (process.platform === "win32") {
    const winPath = path.join(outDir, "Twig-win32-x64/Twig.exe");
    if (existsSync(winPath)) return winPath;

    throw new Error(
      `No packaged app found in ${outDir}. Run 'pnpm --filter twig package' first.`,
    );
  }

  if (process.platform === "linux") {
    const linuxPath = path.join(outDir, "Twig-linux-x64/Twig");
    if (existsSync(linuxPath)) return linuxPath;

    throw new Error(
      `No packaged app found in ${outDir}. Run 'pnpm --filter twig package' first.`,
    );
  }

  throw new Error(`Unsupported platform: ${process.platform}`);
}

type ElectronFixtures = {
  electronApp: ElectronApplication;
  window: Page;
};

export const test = base.extend<ElectronFixtures>({
  // biome-ignore lint/correctness/noEmptyPattern: Playwright fixture requires empty destructuring
  electronApp: async ({}, use) => {
    const appPath = getAppPath();

    const electronApp = await electron.launch({
      executablePath: appPath,
      args: [],
      env: {
        ...process.env,
        ELECTRON_DISABLE_GPU: "1",
      },
    });

    await use(electronApp);
    await electronApp.close();
  },

  window: async ({ electronApp }, use) => {
    const window = await electronApp.firstWindow();
    await window.waitForLoadState("domcontentloaded");
    await use(window);
  },
});

export { expect } from "@playwright/test";
