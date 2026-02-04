import { SettingRow } from "@features/settings/components/SettingRow";
import {
  type CompletionSound,
  type SendMessagesWith,
  useSettingsStore,
} from "@features/settings/stores/settingsStore";
import { Button, Flex, Select, Slider, Switch, Text } from "@radix-ui/themes";
import { track } from "@renderer/lib/analytics";
import { playCompletionSound } from "@renderer/lib/sounds";
import { useCallback } from "react";
import { ANALYTICS_EVENTS } from "@/types/analytics";

export function ChatSettings() {
  const {
    desktopNotifications,
    dockBadgeNotifications,
    completionSound,
    completionVolume,
    autoConvertLongText,
    sendMessagesWith,
    setDesktopNotifications,
    setDockBadgeNotifications,
    setCompletionSound,
    setCompletionVolume,
    setAutoConvertLongText,
    setSendMessagesWith,
  } = useSettingsStore();

  const handleCompletionSoundChange = useCallback(
    (value: CompletionSound) => {
      track(ANALYTICS_EVENTS.SETTING_CHANGED, {
        setting_name: "completion_sound",
        new_value: value,
        old_value: completionSound,
      });
      setCompletionSound(value);
    },
    [completionSound, setCompletionSound],
  );

  const handleTestSound = useCallback(() => {
    playCompletionSound(completionSound, completionVolume);
  }, [completionSound, completionVolume]);

  const handleAutoConvertLongTextChange = useCallback(
    (checked: boolean) => {
      track(ANALYTICS_EVENTS.SETTING_CHANGED, {
        setting_name: "auto_convert_long_text",
        new_value: checked,
        old_value: autoConvertLongText,
      });
      setAutoConvertLongText(checked);
    },
    [autoConvertLongText, setAutoConvertLongText],
  );

  const handleSendMessagesWithChange = useCallback(
    (value: SendMessagesWith) => {
      track(ANALYTICS_EVENTS.SETTING_CHANGED, {
        setting_name: "send_messages_with",
        new_value: value,
        old_value: sendMessagesWith,
      });
      setSendMessagesWith(value);
    },
    [sendMessagesWith, setSendMessagesWith],
  );

  return (
    <Flex direction="column">
      <SettingRow
        label="Push notifications"
        description="Receive a desktop notification when the agent finishes a task or needs your input"
      >
        <Switch
          checked={desktopNotifications}
          onCheckedChange={setDesktopNotifications}
          size="1"
        />
      </SettingRow>

      <SettingRow
        label="Dock badge"
        description="Display a badge on the dock icon when the agent finishes a task or needs your input"
      >
        <Switch
          checked={dockBadgeNotifications}
          onCheckedChange={setDockBadgeNotifications}
          size="1"
        />
      </SettingRow>

      <SettingRow
        label="Sound effect"
        description="Play a sound when the agent finishes a task or needs your input"
      >
        <Flex align="center" gap="2">
          <Select.Root
            value={completionSound}
            onValueChange={(value) =>
              handleCompletionSoundChange(value as CompletionSound)
            }
            size="1"
          >
            <Select.Trigger style={{ minWidth: "100px" }} />
            <Select.Content>
              <Select.Item value="none">None</Select.Item>
              <Select.Item value="guitar">Guitar solo</Select.Item>
              <Select.Item value="danilo">I'm ready</Select.Item>
              <Select.Item value="revi">Cute noise</Select.Item>
              <Select.Item value="meep">Meep</Select.Item>
            </Select.Content>
          </Select.Root>
          {completionSound !== "none" && (
            <Button variant="soft" size="1" onClick={handleTestSound}>
              Test
            </Button>
          )}
        </Flex>
      </SettingRow>

      {completionSound !== "none" && (
        <SettingRow label="Sound volume">
          <Flex align="center" gap="3">
            <Slider
              value={[completionVolume]}
              onValueChange={([value]) => setCompletionVolume(value)}
              min={0}
              max={100}
              step={1}
              size="1"
              style={{ width: "120px" }}
            />
            <Text size="1" color="gray">
              {completionVolume}%
            </Text>
          </Flex>
        </SettingRow>
      )}

      <SettingRow
        label="Send messages with"
        description="Choose which key combination sends messages. Use Shift+Enter for new lines."
      >
        <Select.Root
          value={sendMessagesWith}
          onValueChange={(value) =>
            handleSendMessagesWithChange(value as SendMessagesWith)
          }
          size="1"
        >
          <Select.Trigger style={{ minWidth: "100px" }} />
          <Select.Content>
            <Select.Item value="enter">Enter</Select.Item>
            <Select.Item value="cmd+enter">⌘ Enter</Select.Item>
          </Select.Content>
        </Select.Root>
      </SettingRow>

      <SettingRow
        label="Auto-convert long text"
        description="Automatically convert pasted text over 500 characters into an attachment"
        noBorder
      >
        <Switch
          checked={autoConvertLongText}
          onCheckedChange={handleAutoConvertLongTextChange}
          size="1"
        />
      </SettingRow>
    </Flex>
  );
}
