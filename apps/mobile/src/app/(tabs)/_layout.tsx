import { Icon, Label, NativeTabs } from "expo-router/unstable-native-tabs";
import { DynamicColorIOS, Platform } from "react-native";

export default function TabsLayout() {
  // Dynamic colors for liquid glass effect on iOS
  const dynamicTextColor =
    Platform.OS === "ios"
      ? DynamicColorIOS({
          dark: "white",
          light: "black",
        })
      : "white";

  const dynamicTintColor =
    Platform.OS === "ios"
      ? DynamicColorIOS({
          dark: "#f97316", // orange-500
          light: "#ea580c", // orange-600
        })
      : "#f97316";

  return (
    <NativeTabs
      labelStyle={{
        color: dynamicTextColor,
      }}
      tintColor={dynamicTintColor}
      minimizeBehavior="onScrollDown"
    >
      {/* Tasks - Home Tab */}
      <NativeTabs.Trigger name="index">
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

      {/* Chat - Separate floating button (iOS search role style) */}
      <NativeTabs.Trigger name="chat" role="search">
        <Label hidden />
        <Icon
          sf={{ default: "plus", selected: "plus" }}
          drawable="ic_menu_add"
        />
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
