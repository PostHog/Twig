import { Jimp } from "jimp";
import { expect, test } from "../fixtures/electron";

test.describe("Visual Stability", () => {
  test("consecutive screenshots are visually identical (no flickering)", async ({
    window,
  }) => {
    await window.waitForSelector("#root > *", { timeout: 30000 });
    await window
      .locator("text=Loading")
      .waitFor({ state: "hidden", timeout: 30000 })
      .catch(() => {});

    await window.waitForTimeout(1000);

    const screenshot1 = await window.screenshot();
    const screenshot1Hash = (await Jimp.read(screenshot1)).hash();

    const screenshot2 = await window.screenshot();
    const screenshot2Hash = (await Jimp.read(screenshot2)).hash();

    expect(screenshot1Hash).toEqual(screenshot2Hash);
  });
});
