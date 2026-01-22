import { expect, test } from "./fixtures/electron";

test.describe("Twig Electron Smoke Tests", () => {
  test("app launches successfully and window appears", async ({
    electronApp,
    window,
  }) => {
    expect(electronApp).toBeTruthy();
    expect(window).toBeTruthy();

    const title = await window.title();
    expect(title).toContain("Twig");
  });

  test("app renders initial UI (auth or main layout)", async ({ window }) => {
    // Wait for React to mount
    await window.waitForSelector("#root > *", { timeout: 30000 });

    // Wait for loading state to complete (loading spinner to disappear)
    await window
      .locator("text=Loading")
      .waitFor({ state: "hidden", timeout: 30000 })
      .catch(() => {
        // Loading text might have already disappeared, that's fine
      });

    // The app shows either AuthScreen or MainLayout after loading
    // Both are valid boot states
    const hasAuthScreen = await window
      .locator("text=Sign in with PostHog")
      .isVisible()
      .catch(() => false);

    const hasMainLayout = await window
      .locator("text=Twig")
      .first()
      .isVisible()
      .catch(() => false);

    const isValidBootState = hasAuthScreen || hasMainLayout;
    expect(isValidBootState).toBe(true);
  });

  test("main process exposes tRPC bridge", async ({ window }) => {
    const hasTrpcBridge = await window.evaluate(() => {
      return (
        typeof (window as unknown as { electronTRPC: unknown }).electronTRPC !==
        "undefined"
      );
    });

    expect(hasTrpcBridge).toBe(true);
  });

  test("app does not crash within 10 seconds of boot", async ({
    electronApp,
    window,
  }) => {
    await window.waitForTimeout(10000);

    const isWindowClosed = window.isClosed();
    expect(isWindowClosed).toBe(false);

    const windows = electronApp.windows();
    expect(windows.length).toBeGreaterThan(0);
  });

  test("window has correct minimum dimensions", async ({ window }) => {
    const bounds = await window.evaluate(() => ({
      width: window.innerWidth,
      height: window.innerHeight,
    }));

    // Based on index.ts: minWidth: 900, minHeight: 600
    expect(bounds.width).toBeGreaterThanOrEqual(900);
    expect(bounds.height).toBeGreaterThanOrEqual(600);
  });
});
