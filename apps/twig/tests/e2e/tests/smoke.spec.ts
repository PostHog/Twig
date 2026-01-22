import { expect, test } from "../fixtures/electron";

test.describe("Smoke Tests", () => {
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
    await window.waitForSelector("#root > *", { timeout: 30000 });

    await window
      .locator("text=Loading")
      .waitFor({ state: "hidden", timeout: 30000 })
      .catch(() => {});

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

  test("window has correct minimum dimensions", async ({ window }) => {
    const bounds = await window.evaluate(() => ({
      width: window.innerWidth,
      height: window.innerHeight,
    }));

    expect(bounds.width).toBeGreaterThanOrEqual(900);
    expect(bounds.height).toBeGreaterThanOrEqual(600);
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
});
