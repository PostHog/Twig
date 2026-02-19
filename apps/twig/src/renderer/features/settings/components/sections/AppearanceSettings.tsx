import { SettingRow } from "@features/settings/components/SettingRow";
import { useSettingsStore } from "@features/settings/stores/settingsStore";
import { Flex, Select, Switch, Text, TextField } from "@radix-ui/themes";
import type { ThemePreference } from "@stores/themeStore";
import { track } from "@renderer/lib/analytics";
import { useSettingsStore as useTerminalSettingsStore } from "@stores/settingsStore";
import { useThemeStore } from "@stores/themeStore";
import { useCallback, useEffect, useRef, useState } from "react";
import { ANALYTICS_EVENTS } from "@/types/analytics";

const CUSTOM_TERMINAL_FONT_VALUE = "custom";
const CUSTOM_TERMINAL_FONT_COMMIT_DELAY_MS = 400;
const TERMINAL_FONT_PRESETS = [
  {
    label: "System monospace",
    value: "monospace",
  },
  {
    label: "MesloLGL Nerd Font Mono",
    value: '"MesloLGL Nerd Font Mono", monospace',
  },
  {
    label: "JetBrains Mono",
    value: '"JetBrains Mono", monospace',
  },
];

export function AppearanceSettings() {
  const theme = useThemeStore((state) => state.theme);
  const isDarkMode = useThemeStore((state) => state.isDarkMode);
  const setTheme = useThemeStore((state) => state.setTheme);
  const { cursorGlow, setCursorGlow } = useSettingsStore();
  const terminalFontFamily = useTerminalSettingsStore(
    (state) => state.terminalFontFamily,
  );
  const terminalFontFamilyLoaded = useTerminalSettingsStore(
    (state) => state.terminalFontFamilyLoaded,
  );
  const loadTerminalFontFamily = useTerminalSettingsStore(
    (state) => state.loadTerminalFontFamily,
  );
  const setTerminalFontFamily = useTerminalSettingsStore(
    (state) => state.setTerminalFontFamily,
  );

  const [customTerminalFont, setCustomTerminalFont] = useState<string>("");
  const customFontSaveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );

  useEffect(() => {
    if (!terminalFontFamilyLoaded) {
      loadTerminalFontFamily();
    }
  }, [terminalFontFamilyLoaded, loadTerminalFontFamily]);

  useEffect(() => {
    return () => {
      if (customFontSaveTimeoutRef.current) {
        clearTimeout(customFontSaveTimeoutRef.current);
        customFontSaveTimeoutRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    const matchesPreset = TERMINAL_FONT_PRESETS.some(
      (preset) => preset.value === terminalFontFamily,
    );
    if (!matchesPreset) {
      setCustomTerminalFont(terminalFontFamily);
    }
  }, [terminalFontFamily]);

  const handleThemeChange = useCallback(
    (value: ThemePreference) => {
      track(ANALYTICS_EVENTS.SETTING_CHANGED, {
        setting_name: "theme",
        new_value: value,
        old_value: theme,
      });
      if (value === "light" && cursorGlow) {
        setCursorGlow(false);
      }
      setTheme(value);
    },
    [theme, setTheme, cursorGlow, setCursorGlow],
  );

  const handleCursorGlowChange = useCallback(
    (checked: boolean) => {
      track(ANALYTICS_EVENTS.SETTING_CHANGED, {
        setting_name: "cursor_glow",
        new_value: checked,
        old_value: cursorGlow,
      });
      setCursorGlow(checked);
    },
    [cursorGlow, setCursorGlow],
  );

  const clearCustomFontSaveTimeout = useCallback(() => {
    if (customFontSaveTimeoutRef.current) {
      clearTimeout(customFontSaveTimeoutRef.current);
      customFontSaveTimeoutRef.current = null;
    }
  }, []);

  const commitCustomTerminalFont = useCallback(
    (value: string) => {
      const normalizedValue = value.trim();
      if (!normalizedValue) {
        return;
      }

      const previousValue = terminalFontFamily.trim() || "monospace";
      if (normalizedValue === previousValue) {
        return;
      }

      track(ANALYTICS_EVENTS.SETTING_CHANGED, {
        setting_name: "terminal_font_family",
        new_value: normalizedValue,
        old_value: previousValue,
      });

      setTerminalFontFamily(normalizedValue);
    },
    [setTerminalFontFamily, terminalFontFamily],
  );

  const handleTerminalFontChange = useCallback(
    (value: string) => {
      clearCustomFontSaveTimeout();

      if (value === CUSTOM_TERMINAL_FONT_VALUE) {
        if (!customTerminalFont.trim()) {
          setTerminalFontFamily("");
          return;
        }

        commitCustomTerminalFont(customTerminalFont);
        return;
      }

      if (value === terminalFontFamily) {
        return;
      }

      track(ANALYTICS_EVENTS.SETTING_CHANGED, {
        setting_name: "terminal_font_family",
        new_value: value,
        old_value: terminalFontFamily,
      });

      setTerminalFontFamily(value);
    },
    [
      clearCustomFontSaveTimeout,
      commitCustomTerminalFont,
      customTerminalFont,
      setTerminalFontFamily,
      terminalFontFamily,
    ],
  );

  const handleCustomTerminalFontChange = useCallback(
    (value: string) => {
      setCustomTerminalFont(value);
      clearCustomFontSaveTimeout();
      customFontSaveTimeoutRef.current = setTimeout(() => {
        commitCustomTerminalFont(value);
      }, CUSTOM_TERMINAL_FONT_COMMIT_DELAY_MS);
    },
    [clearCustomFontSaveTimeout, commitCustomTerminalFont],
  );

  const handleCustomTerminalFontBlur = useCallback(() => {
    clearCustomFontSaveTimeout();
    commitCustomTerminalFont(customTerminalFont);
  }, [
    clearCustomFontSaveTimeout,
    commitCustomTerminalFont,
    customTerminalFont,
  ]);

  const terminalFontSelection = TERMINAL_FONT_PRESETS.some(
    (preset) => preset.value === terminalFontFamily,
  )
    ? terminalFontFamily
    : CUSTOM_TERMINAL_FONT_VALUE;

  return (
    <Flex direction="column">
      <SettingRow
        label="Theme"
        description="Choose light, dark, or follow your system preference"
      >
        <Select.Root
          value={theme}
          onValueChange={(v) => handleThemeChange(v as ThemePreference)}
          size="1"
        >
          <Select.Trigger style={{ minWidth: "100px" }} />
          <Select.Content>
            <Select.Item value="light">Light</Select.Item>
            <Select.Item value="dark">Dark</Select.Item>
            <Select.Item value="system">System</Select.Item>
          </Select.Content>
        </Select.Root>
      </SettingRow>

      {isDarkMode && (
        <SettingRow
          label="Cursor glow"
          description="Show a glow effect that follows your cursor"
        >
          <Switch
            checked={cursorGlow}
            onCheckedChange={handleCursorGlowChange}
            size="1"
          />
        </SettingRow>
      )}

      <SettingRow
        label="Terminal font"
        description="Uses locally installed fonts. Nerd fonts are recommended for prompt glyphs."
        noBorder={terminalFontSelection !== CUSTOM_TERMINAL_FONT_VALUE}
      >
        <Select.Root
          value={terminalFontSelection}
          onValueChange={handleTerminalFontChange}
          size="1"
        >
          <Select.Trigger style={{ minWidth: "140px" }} />
          <Select.Content>
            {TERMINAL_FONT_PRESETS.map((preset) => (
              <Select.Item key={preset.value} value={preset.value}>
                {preset.label}
              </Select.Item>
            ))}
            <Select.Item value={CUSTOM_TERMINAL_FONT_VALUE}>
              Custom font family
            </Select.Item>
          </Select.Content>
        </Select.Root>
      </SettingRow>

      {terminalFontSelection === CUSTOM_TERMINAL_FONT_VALUE && (
        <SettingRow label="Custom font family" noBorder>
          <Flex direction="column" gap="1" style={{ minWidth: "200px" }}>
            <TextField.Root
              size="1"
              placeholder="Enter font family"
              value={customTerminalFont}
              onChange={(event) =>
                handleCustomTerminalFontChange(event.target.value)
              }
              onBlur={handleCustomTerminalFontBlur}
            />
            <Text size="1" color="gray">
              Example: MesloLGL Nerd Font Mono
            </Text>
          </Flex>
        </SettingRow>
      )}
    </Flex>
  );
}
