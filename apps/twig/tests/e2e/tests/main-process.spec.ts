import { expect, test } from "../fixtures/electron";

test.describe("Main Process", () => {
  test("app info is accessible", async ({ electronApp }) => {
    const appName = await electronApp.evaluate(async ({ app }) => {
      return app.getName();
    });

    expect(appName).toBe("Twig");
  });

  test("app is packaged correctly", async ({ electronApp }) => {
    const isPackaged = await electronApp.evaluate(async ({ app }) => {
      return app.isPackaged;
    });

    expect(isPackaged).toBe(true);
  });

  test("app has single instance lock", async ({ electronApp }) => {
    const appPaths = await electronApp.evaluate(async ({ app }) => {
      return {
        userData: app.getPath("userData"),
        exe: app.getPath("exe"),
        appData: app.getPath("appData"),
      };
    });

    expect(appPaths.userData).toBeTruthy();
    expect(appPaths.exe).toBeTruthy();
    expect(appPaths.appData).toBeTruthy();
  });

  test("user data path is set correctly", async ({ electronApp }) => {
    const userDataPath = await electronApp.evaluate(async ({ app }) => {
      return app.getPath("userData");
    });

    expect(userDataPath).toContain("Twig");
  });
});
