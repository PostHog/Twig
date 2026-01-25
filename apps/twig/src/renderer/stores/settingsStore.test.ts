import { beforeEach, describe, expect, it, vi } from "vitest";

const { getItem, setItem } = vi.hoisted(() => ({
  getItem: vi.fn(),
  setItem: vi.fn(),
}));

vi.mock("../trpc", () => ({
  trpcVanilla: {
    secureStore: {
      getItem: { query: getItem },
      setItem: { query: setItem },
    },
  },
}));

import { useSettingsStore } from "./settingsStore";

describe("settingsStore terminal font", () => {
  beforeEach(() => {
    getItem.mockReset();
    setItem.mockReset();
    useSettingsStore.setState({
      terminalFontFamily: "monospace",
      terminalFontFamilyLoaded: false,
    });
  });

  it("loads terminal font family from secure store", async () => {
    getItem.mockResolvedValue("MesloLGL Nerd Font Mono");

    await useSettingsStore.getState().loadTerminalFontFamily();

    expect(getItem).toHaveBeenCalledWith({ key: "terminalFontFamily" });
    expect(useSettingsStore.getState().terminalFontFamily).toBe(
      "MesloLGL Nerd Font Mono",
    );
    expect(useSettingsStore.getState().terminalFontFamilyLoaded).toBe(true);
  });

  it("keeps default when no terminal font is stored", async () => {
    getItem.mockResolvedValue(null);

    await useSettingsStore.getState().loadTerminalFontFamily();

    expect(useSettingsStore.getState().terminalFontFamily).toBe("monospace");
    expect(useSettingsStore.getState().terminalFontFamilyLoaded).toBe(true);
  });

  it("persists terminal font family updates", async () => {
    setItem.mockResolvedValue(undefined);

    await useSettingsStore.getState().setTerminalFontFamily("JetBrains Mono");

    expect(setItem).toHaveBeenCalledWith({
      key: "terminalFontFamily",
      value: "JetBrains Mono",
    });
    expect(useSettingsStore.getState().terminalFontFamily).toBe(
      "JetBrains Mono",
    );
    expect(useSettingsStore.getState().terminalFontFamilyLoaded).toBe(true);
  });
});
