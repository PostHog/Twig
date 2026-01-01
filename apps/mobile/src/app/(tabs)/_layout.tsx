import { Icon, Label, NativeTabs } from "expo-router/unstable-native-tabs";
import { DynamicColorIOS, Platform } from "react-native";
import { useThemeColors } from "@/lib/theme";

export default function TabsLayout() {
  const themeColors = useThemeColors();

  // Dynamic colors for liquid glass effect on iOS
  const dynamicTextColor =
    Platform.OS === "ios"
      ? DynamicColorIOS({
          dark: themeColors.gray[12],
          light: themeColors.gray[12],
        })
      : themeColors.gray[12];

  const dynamicTintColor =
    Platform.OS === "ios"
      ? DynamicColorIOS({
          dark: themeColors.accent[9],
          light: themeColors.accent[9],
        })
      : themeColors.accent[9];

  return (
    <NativeTabs
      labelStyle={{
        color: dynamicTextColor,
      }}
      tintColor={dynamicTintColor}
      minimizeBehavior="onScrollDown"
    >
      {/* Conversations - First Tab (default landing) */}
      <NativeTabs.Trigger name="index">
        <Label>Chats</Label>
        <Icon
          sf={{
            default: "bubble.left.and.bubble.right",
            selected: "bubble.left.and.bubble.right.fill",
          }}
          drawable="ic_menu_send"
        />
      </NativeTabs.Trigger>

      {/* Tasks Tab */}
      <NativeTabs.Trigger name="tasks">
        <Label>Tasks</Label>
        <Icon
          sf={{ default: "checklist", selected: "checklist" }}
          drawable="ic_menu_agenda"
        />
      </NativeTabs.Trigger>

      {/* Settings/Profile Tab */}
      <NativeTabs.Trigger name="settings">
        <Label>Profile</Label>
        <Icon
          sf={{ default: "person", selected: "person.fill" }}
          drawable="ic_menu_preferences"
        />
      </NativeTabs.Trigger>

      {/* TODO: Fix this and use NativeTabs.Trigger for opening the chat */}
      {/* Chat - Separate floating button (iOS search role style) */}
      {/* <NativeTabs.Trigger name="chat" role="search">
        <Label hidden />
        <Icon
          sf={{ default: "plus", selected: "plus" }}
          drawable="ic_menu_add"
        />
      </NativeTabs.Trigger> */}
    </NativeTabs>
  );
}
