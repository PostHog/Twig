import { useSettingsStore } from "@features/settings/stores/settingsStore";
import { Flex, Text, TextArea } from "@radix-ui/themes";
import { track } from "@renderer/lib/analytics";
import { ANALYTICS_EVENTS } from "@shared/types/analytics";
import { useCallback, useEffect, useRef, useState } from "react";

const MAX_INSTRUCTIONS_LENGTH = 2000;
const DEBOUNCE_MS = 500;

export function PersonalizationSettings() {
  const customInstructions = useSettingsStore((s) => s.customInstructions);
  const setCustomInstructions = useSettingsStore(
    (s) => s.setCustomInstructions,
  );

  const [localInstructions, setLocalInstructions] =
    useState(customInstructions);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Sync local state when store changes externally
  useEffect(() => {
    setLocalInstructions(customInstructions);
  }, [customInstructions]);

  const saveInstructions = useCallback(
    (value: string) => {
      const trimmed = value.slice(0, MAX_INSTRUCTIONS_LENGTH);
      setCustomInstructions(trimmed);
      track(ANALYTICS_EVENTS.SETTING_CHANGED, {
        setting_name: "custom_instructions",
        new_value: trimmed.length > 0,
      });
    },
    [setCustomInstructions],
  );

  const handleInstructionsChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const value = e.target.value.slice(0, MAX_INSTRUCTIONS_LENGTH);
      setLocalInstructions(value);

      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
      debounceRef.current = setTimeout(() => {
        saveInstructions(value);
      }, DEBOUNCE_MS);
    },
    [saveInstructions],
  );

  const handleInstructionsBlur = useCallback(() => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }
    saveInstructions(localInstructions);
  }, [localInstructions, saveInstructions]);

  // Cleanup debounce on unmount
  useEffect(() => {
    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, []);

  return (
    <Flex direction="column" gap="1" py="4">
      <Flex direction="column" gap="1" className="mb-2">
        <Text size="2" weight="medium">
          Custom instructions
        </Text>
        <Text size="1" color="gray">
          Instructions included in every agent session
        </Text>
      </Flex>
      <TextArea
        value={localInstructions}
        onChange={handleInstructionsChange}
        onBlur={handleInstructionsBlur}
        placeholder="e.g. Always write tests for new code. Prefer functional patterns."
        rows={6}
        size="1"
        style={{ width: "100%", fontFamily: "var(--font-mono)" }}
      />
      <Text size="1" color="gray" align="right">
        {localInstructions.length}/{MAX_INSTRUCTIONS_LENGTH}
      </Text>
    </Flex>
  );
}
